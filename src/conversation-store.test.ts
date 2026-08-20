import { describe, expect, it, vi } from "vitest";

import mashalaApplication from "./test-application";
import { defineMashalaApplication } from "./application";
import { defineCapability } from "./capabilities";
import {
  ANONYMOUS_AUTH_SCOPE_TAG,
  CONVERSATION_LIMITS,
  PROJECTED_CONTEXT_TRANSCRIPT_NOTICE,
  createConversationStore,
  fingerprintMashalaSpec,
  type ConversationOwnershipCoordinator,
  type ConversationStorage,
} from "./conversation-store";
import { f } from "./fields";

class MemoryStorage implements ConversationStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function ids(prefix = "conversation") {
  let sequence = 0;
  return () => `${prefix}_${String(++sequence).padStart(32, "0")}`;
}

function noOwnership(): ConversationOwnershipCoordinator {
  return {
    adopt: vi.fn(),
    claim: vi.fn(async () => false),
    release: vi.fn(),
    close: vi.fn(),
  };
}

function options(
  storage: ConversationStorage,
  overrides: Partial<Parameters<typeof createConversationStore>[0]> = {},
) {
  return {
    application: mashalaApplication,
    authScopeTag: ANONYMOUS_AUTH_SCOPE_TAG,
    storage,
    createConversationId: ids(),
    ownership: noOwnership(),
    ...overrides,
  };
}

describe("browser-owned conversation store", () => {
  it("exposes explicit new and expire lifecycle operations", async () => {
    const storage = new MemoryStorage();
    let timestamp = 100;
    const store = createConversationStore(options(storage, { now: () => timestamp }));
    const first = store.newConversation();
    expect(first).toMatchObject({ ok: true, value: { workflow: { phase: "idle" } } });
    if (!first.ok) throw new Error("expected new conversation");
    timestamp += 30 * 60 * 1_000;
    const expired = store.expire();
    expect(expired).toMatchObject({
      ok: true,
      value: { expired: true, record: { transcript: [], workflow: { phase: "idle" } } },
    });
    if (!expired.ok) throw new Error("expected expiry");
    expect(expired.value.record.conversationId).not.toBe(first.value.conversationId);
  });

  it("creates, appends, updates, and reloads only the safe refresh state", async () => {
    const storage = new MemoryStorage();
    let timestamp = 1_000;
    const first = createConversationStore(options(storage, { now: () => timestamp }));
    const loaded = await first.load();

    expect(loaded).toMatchObject({ ok: true, value: { status: "new" } });
    if (!loaded.ok) throw new Error("expected load");
    const conversationId = loaded.value.record.conversationId;

    timestamp += 10;
    expect(first.append({ eventId: "user_1", role: "user", text: "Transfer money" })).toMatchObject({ ok: true });
    timestamp += 10;
    expect(first.append({ eventId: "assistant_1", role: "assistant", text: "I can help." })).toMatchObject({ ok: true });
    timestamp += 10;
    const updated = first.update({
      phase: "filling",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "Ava", amount: 25 },
    });
    expect(updated).toMatchObject({
      ok: true,
      value: {
        workflow: {
          phase: "filling",
          capabilityId: "transfer_money",
          draft: { recipient: "Ava", amount: 25 },
        },
      },
    });

    first.close();
    timestamp += 10;
    const second = createConversationStore(options(storage, {
      now: () => timestamp,
      createConversationId: ids("replacement"),
    }));
    const restored = await second.load();
    expect(restored).toMatchObject({
      ok: true,
      value: {
        status: "loaded",
        record: {
          conversationId,
          transcript: [
            { role: "user", text: "Transfer money" },
            { role: "assistant", text: "I can help." },
          ],
          workflow: { phase: "filling", draft: { recipient: "Ava", amount: 25 } },
        },
      },
    });
  });

  it("downgrades confirming/fetching and makes executing non-resumable", async () => {
    const storage = new MemoryStorage();
    let timestamp = 5_000;
    const store = createConversationStore(options(storage, { now: () => timestamp }));
    await store.load();

    expect(store.update({
      phase: "confirming",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "Sam", amount: 10, speed: "standard" },
    })).toMatchObject({ ok: true, value: { workflow: { phase: "filling" } } });

    timestamp += 1;
    const fetching = store.update({
      phase: "fetching",
      capabilityId: "show_product",
      capabilityKind: "read",
      readHasInput: true,
      draft: { productId: "product_1" },
    });
    expect(fetching).toMatchObject({
      ok: true,
      value: { workflow: { phase: "collecting", draft: { productId: "product_1" } } },
    });

    timestamp += 1;
    const executing = store.update({
      phase: "executing",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "Sam", amount: 10 },
    });
    expect(executing).toMatchObject({
      ok: true,
      value: {
        workflow: { phase: "idle" },
        outcomes: [{
          capabilityId: "transfer_money",
          outcome: "interrupted_unknown",
        }],
      },
    });
    expect(JSON.stringify(executing)).not.toContain("recipient");
    expect(JSON.stringify(executing)).not.toContain("reviewedSnapshot");
  });

  it("does not restore reference selections and retains valid static draft values", async () => {
    const storage = new MemoryStorage();
    const referenceApplication = defineMashalaApplication({
      app: { id: "reference_app", name: "Reference", description: "Reference test" },
      capabilities: [defineCapability({
        id: "pay_bill",
        description: "Pay a bill",
        fields: {
          fromAccount: f.reference({
            label: "From account",
            source: { method: "GET", path: "/accounts" },
            value: "id",
            labelFrom: "display_name",
          }),
          recipient: f.text({ label: "Recipient", minLength: 1 }),
          amount: f.number({ label: "Amount", minimum: 1 }),
        },
        operation: { method: "POST", path: "/payments" },
        confirmation: "required",
      })],
    });
    const store = createConversationStore(options(storage, { application: referenceApplication }));
    await store.load();

    const result = store.update({
      phase: "filling",
      capabilityId: "pay_bill",
      capabilityKind: "write",
      draft: {
        fromAccount: "account_1",
        recipient: "Ava",
        amount: -5,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { workflow: { draft: { recipient: "Ava" } } },
    });
    expect(JSON.stringify(result)).not.toContain("account_1");
  });

  it("replaces projected-context assistant text with the fixed retention notice", async () => {
    const storage = new MemoryStorage();
    const store = createConversationStore(options(storage));
    await store.load();

    const result = store.append({
      eventId: "assistant_projected",
      role: "assistant",
      text: "Your private backend value was 123.",
      source: "backend_projection",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { transcript: [{ text: PROJECTED_CONTEXT_TRANSCRIPT_NOTICE }] },
    });
    expect(JSON.stringify(result)).not.toContain("private backend value");
  });

  it.each([
    { label: "inactivity", advance: 30 * 60 * 1_000 },
    { label: "absolute lifetime", advance: 8 * 60 * 60 * 1_000 },
  ])("expires on $label before accepting another update", async ({ advance }) => {
    const storage = new MemoryStorage();
    let timestamp = 20_000;
    const store = createConversationStore(options(storage, { now: () => timestamp }));
    const initial = await store.load();
    if (!initial.ok) throw new Error("expected load");
    const oldId = initial.value.record.conversationId;
    timestamp += advance;

    const append = store.append({ eventId: "late", role: "user", text: "Too late" });
    expect(append).toMatchObject({ ok: false, code: "expired" });
    if (append.ok || append.replacement === undefined) throw new Error("expected replacement");
    expect(append.replacement.conversationId).not.toBe(oldId);
    expect(append.replacement.transcript).toEqual([]);
  });

  it("clears and logs out into fresh isolated conversation IDs", async () => {
    const storage = new MemoryStorage();
    const store = createConversationStore(options(storage, { authScopeTag: "auth_scope_a" }));
    const initial = await store.load();
    if (!initial.ok) throw new Error("expected load");
    store.append({ eventId: "user", role: "user", text: "hello" });

    const cleared = store.clear();
    expect(cleared).toMatchObject({
      ok: true,
      value: { authScopeTag: "auth_scope_a", transcript: [] },
    });
    if (!cleared.ok) throw new Error("expected clear");
    expect(cleared.value.conversationId).not.toBe(initial.value.record.conversationId);

    const loggedOut = store.logout();
    expect(loggedOut).toMatchObject({
      ok: true,
      value: { authScopeTag: ANONYMOUS_AUTH_SCOPE_TAG, transcript: [] },
    });
    if (!loggedOut.ok) throw new Error("expected logout");
    expect(loggedOut.value.conversationId).not.toBe(cleared.value.conversationId);
  });

  it("discards anonymous/authenticated history on every identity change", async () => {
    const storage = new MemoryStorage();
    const anonymous = createConversationStore(options(storage));
    await anonymous.load();
    anonymous.append({ eventId: "anon", role: "user", text: "anonymous history" });
    const authenticated = anonymous.changeIdentity("auth_scope_user_a");
    expect(authenticated).toMatchObject({ ok: true, value: { transcript: [] } });
    anonymous.append({ eventId: "user_a", role: "user", text: "user A history" });

    const switched = anonymous.changeIdentity("auth_scope_user_b");
    expect(switched).toMatchObject({
      ok: true,
      value: { authScopeTag: "auth_scope_user_b", transcript: [] },
    });
    expect(JSON.stringify(switched)).not.toContain("user A history");
  });

  it("isolates application, auth scope, browser session storage, and conversation ID", async () => {
    const storageA = new MemoryStorage();
    const storageB = new MemoryStorage();
    const first = createConversationStore(options(storageA, { authScopeTag: "scope_a" }));
    const firstLoad = await first.load();
    if (!firstLoad.ok) throw new Error("expected load");
    first.append({ eventId: "private", role: "user", text: "private A" });

    const otherSession = createConversationStore(options(storageB, { authScopeTag: "scope_a" }));
    const otherSessionLoad = await otherSession.load();
    expect(otherSessionLoad).toMatchObject({ ok: true, value: { record: { transcript: [] } } });

    first.close();
    const otherIdentity = createConversationStore(options(storageA, {
      authScopeTag: "scope_b",
      createConversationId: ids("scope_b"),
    }));
    const otherIdentityLoad = await otherIdentity.load();
    expect(otherIdentityLoad).toMatchObject({
      ok: true,
      value: { status: "replaced", record: { transcript: [], authScopeTag: "scope_b" } },
    });
    expect(JSON.stringify(otherIdentityLoad)).not.toContain("private A");

    const otherApplication = defineMashalaApplication({
      app: { id: "other_app", name: "Other", description: "Other app" },
      capabilities: [defineCapability({
        id: "submit_note",
        description: "Submit a note",
        fields: { note: f.text({ label: "Note" }) },
        operation: { method: "POST", path: "/notes" },
        confirmation: "required",
      })],
    });
    const applicationStore = createConversationStore(options(storageA, {
      application: otherApplication,
      authScopeTag: "scope_b",
      createConversationId: ids("other_app"),
    }));
    const applicationLoad = await applicationStore.load();
    expect(applicationLoad).toMatchObject({ ok: true, value: { record: { appId: "other_app", transcript: [] } } });
    expect(applicationStore.storageKey).not.toBe(first.storageKey);
  });

  it.each([
    "not json",
    JSON.stringify({ version: 1, unexpected: true }),
  ])("deletes corrupt state and starts clean", async (raw) => {
    const storage = new MemoryStorage();
    const store = createConversationStore(options(storage));
    storage.setItem(store.storageKey, raw);

    const result = await store.load();
    expect(result).toMatchObject({
      ok: true,
      value: { status: "replaced", record: { workflow: { phase: "idle" }, transcript: [] } },
    });
  });

  it("deletes state for a changed spec fingerprint or missing capability", async () => {
    const storage = new MemoryStorage();
    const first = createConversationStore(options(storage));
    await first.load();
    first.update({
      phase: "filling",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "Ava" },
    });
    first.close();

    const raw = storage.getItem(first.storageKey);
    if (raw === null) throw new Error("missing record");
    const changed = JSON.parse(raw) as Record<string, unknown>;
    changed.specFingerprint = "old_fingerprint";
    storage.setItem(first.storageKey, JSON.stringify(changed));

    const next = createConversationStore(options(storage, { createConversationId: ids("fresh") }));
    const result = await next.load();
    expect(result).toMatchObject({ ok: true, value: { status: "replaced", record: { transcript: [], workflow: { phase: "idle" } } } });
  });

  it("serializes one owner and rejects a stale concurrent writer", async () => {
    const storage = new MemoryStorage();
    const first = createConversationStore(options(storage));
    await first.load();

    const staleOwner = createConversationStore(options(storage, {
      createConversationId: ids("stale"),
    }));
    await staleOwner.load();
    expect(first.append({ eventId: "old", role: "user", text: "stale write" })).toMatchObject({
      ok: false,
      code: "stale_update",
    });
    expect(staleOwner.append({ eventId: "new", role: "user", text: "serialized write" })).toMatchObject({ ok: true });
  });

  it("replaces a cloned tab record when a live owner reports the same ID", async () => {
    const storage = new MemoryStorage();
    const claim = vi.fn(async () => true);
    const ownership: ConversationOwnershipCoordinator = {
      adopt: vi.fn(),
      claim,
      release: vi.fn(),
      close: vi.fn(),
    };
    const seed = createConversationStore(options(storage));
    await seed.load();
    seed.close();

    const cloned = createConversationStore(options(storage, {
      createConversationId: ids("new_tab"),
      ownership,
    }));
    const result = await cloned.load();
    expect(result).toMatchObject({ ok: true, value: { status: "replaced" } });
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("enforces message, transcript, outcome, draft, and record retention limits", async () => {
    const storage = new MemoryStorage();
    const store = createConversationStore(options(storage));
    await store.load();

    expect(store.append({
      eventId: "oversized",
      role: "user",
      text: "é".repeat(CONVERSATION_LIMITS.messageBytes),
    })).toMatchObject({ ok: false, code: "message_too_large" });

    for (let index = 0; index < 20; index += 1) {
      expect(store.append({
        eventId: `entry_${String(index)}`,
        role: index % 2 === 0 ? "user" : "assistant",
        text: `message ${String(index)}`,
      })).toMatchObject({ ok: true });
    }
    for (let index = 0; index < 12; index += 1) {
      expect(store.update({
        phase: "completed",
        capabilityId: "transfer_money",
        capabilityKind: "write",
        outcome: {
          capabilityId: "transfer_money",
          capabilityKind: "write",
          outcome: "succeeded",
        },
      })).toMatchObject({ ok: true });
    }
    const final = store.update({
      phase: "filling",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "x".repeat(CONVERSATION_LIMITS.draftBytes) },
    });
    expect(final).toMatchObject({ ok: true });
    if (!final.ok) throw new Error("expected update");
    expect(final.value.transcript).toHaveLength(CONVERSATION_LIMITS.transcriptEntries);
    expect(final.value.transcript[0]?.text).toBe("message 8");
    expect(final.value.outcomes).toHaveLength(CONVERSATION_LIMITS.outcomeSummaries);
    expect(final.value.workflow).toMatchObject({ draft: {} });
    expect(new TextEncoder().encode(JSON.stringify(final.value)).byteLength).toBeLessThanOrEqual(
      CONVERSATION_LIMITS.recordBytes,
    );

    const byteStorage = new MemoryStorage();
    const byteStore = createConversationStore(options(byteStorage));
    await byteStore.load();
    for (let index = 0; index < 12; index += 1) {
      byteStore.append({
        eventId: `large_${String(index)}`,
        role: "user",
        text: `${String(index)}${"x".repeat(3_900)}`,
      });
    }
    const byteRecord = JSON.parse(byteStorage.getItem(byteStore.storageKey) ?? "null") as {
      transcript: unknown[];
    };
    expect(byteRecord.transcript.length).toBeLessThan(12);
    expect(new TextEncoder().encode(JSON.stringify(byteRecord.transcript)).byteLength).toBeLessThanOrEqual(
      CONVERSATION_LIMITS.transcriptBytes,
    );

    const largeDraftApplication = defineMashalaApplication({
      app: { id: "large_draft_app", name: "Large", description: "Large draft test" },
      capabilities: [defineCapability({
        id: "submit_large_note",
        description: "Submit a large note",
        fields: { note: f.longText({ label: "Note", maxLength: 20_000 }) },
        operation: { method: "POST", path: "/notes" },
        confirmation: "required",
      })],
    });
    const largeDraftStorage = new MemoryStorage();
    const largeDraftStore = createConversationStore(options(largeDraftStorage, {
      application: largeDraftApplication,
    }));
    await largeDraftStore.load();
    const omittedDraft = largeDraftStore.update({
      phase: "filling",
      capabilityId: "submit_large_note",
      capabilityKind: "write",
      draft: { note: "x".repeat(17_000) },
    });
    expect(omittedDraft).toMatchObject({
      ok: true,
      value: { workflow: { phase: "filling" } },
    });
    if (!omittedDraft.ok) throw new Error("expected update");
    expect(omittedDraft.value.workflow).not.toHaveProperty("draft");
  });

  it("rejects credential-shaped tags, entries, and drafts without persisting them", async () => {
    const storage = new MemoryStorage();
    const credentialScope = createConversationStore(options(storage, {
      authScopeTag: "Bearer_target_secret_value",
    }));
    expect(await credentialScope.load()).toMatchObject({ ok: false, code: "invalid_auth_scope" });

    const store = createConversationStore(options(storage));
    await store.load();
    expect(store.append({
      eventId: "credential",
      role: "user",
      text: "access_token=target-secret",
    })).toMatchObject({ ok: false, code: "invalid_entry" });
    const draft = store.update({
      phase: "filling",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      draft: { recipient: "safe", access_token: "target-secret" },
    });
    expect(draft).toMatchObject({ ok: true, value: { workflow: { draft: { recipient: "safe" } } } });
    expect(storage.getItem(store.storageKey)).not.toContain("target-secret");
    expect(storage.getItem(store.storageKey)).not.toContain("access_token");
  });

  it("rejects illegal phase/kind pairs and provider-shaped outcome data", async () => {
    const storage = new MemoryStorage();
    const store = createConversationStore(options(storage));
    await store.load();

    expect(store.update({
      phase: "confirming",
      capabilityId: "account_balance",
      capabilityKind: "read",
    })).toMatchObject({ ok: false, code: "invalid_entry" });
    expect(store.update({
      phase: "completed",
      capabilityId: "transfer_money",
      capabilityKind: "write",
      outcome: {
        capabilityId: "transfer_money",
        capabilityKind: "write",
        outcome: "succeeded",
        providerSession: { access_token: "provider-secret" },
      } as never,
    })).toMatchObject({ ok: false, code: "invalid_entry" });
    expect(storage.getItem(store.storageKey)).not.toContain("provider-secret");
    expect(storage.getItem(store.storageKey)).not.toContain("providerSession");
  });

  it("returns sanitized failures and never throws raw storage errors", async () => {
    const storage: ConversationStorage = {
      getItem: () => {
        throw new Error("private browser failure");
      },
      setItem: () => {
        throw new Error("private browser failure");
      },
      removeItem: () => {
        throw new Error("private browser failure");
      },
    };
    const store = createConversationStore(options(storage));
    const result = await store.load();
    expect(result).toEqual({
      ok: false,
      code: "storage_unavailable",
      message: "Conversation memory is unavailable. The request was not sent.",
    });
    expect(JSON.stringify(result)).not.toContain("private browser failure");
  });

  it("fingerprints canonical application content deterministically", () => {
    expect(fingerprintMashalaSpec(mashalaApplication)).toBe(
      fingerprintMashalaSpec(JSON.parse(JSON.stringify(mashalaApplication))),
    );
  });
});
