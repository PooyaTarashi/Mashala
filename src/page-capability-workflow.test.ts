import { describe, expect, it } from "vitest";

import {
  INITIAL_PAGE_CAPABILITY_WORKFLOW,
  isCorrelatedWorkflowResponse,
  transitionPageCapabilityWorkflow,
  type PendingWorkflowRequest,
} from "./page-capability-workflow";

const routeRequest: PendingWorkflowRequest = {
  eventId: "message_1",
  conversationId: "conversation_1",
  kind: "route",
};
const correlation = {
  eventId: routeRequest.eventId,
  conversationId: routeRequest.conversationId,
};

function fillingState() {
  const routing = transitionPageCapabilityWorkflow(
    INITIAL_PAGE_CAPABILITY_WORKFLOW,
    { type: "route.requested", request: routeRequest },
  );
  return transitionPageCapabilityWorkflow(routing, {
    type: "route.matched",
    correlation,
    capabilityId: "transfer_money",
    capabilityKind: "write",
  });
}

describe("page capability workflow transition table", () => {
  it("covers the legal success path with an exact reviewed snapshot", () => {
    const routing = transitionPageCapabilityWorkflow(
      INITIAL_PAGE_CAPABILITY_WORKFLOW,
      { type: "route.requested", request: routeRequest },
    );
    expect(routing.phase).toBe("routing");

    const filling = transitionPageCapabilityWorkflow(routing, {
      type: "route.matched",
      correlation,
      capabilityId: "transfer_money",
      capabilityKind: "write",
    });
    expect(filling.phase).toBe("filling");

    const snapshot = { recipient: "Sam", amount: 25 } as const;
    const confirming = transitionPageCapabilityWorkflow(filling, {
      type: "review.requested",
      capabilityId: "transfer_money",
      snapshot,
    });
    expect(confirming.phase).toBe("confirming");

    const executing = transitionPageCapabilityWorkflow(confirming, {
      type: "execution.requested",
      capabilityId: "transfer_money",
      snapshot,
      confirmation: "required",
    });
    expect(executing.phase).toBe("executing");

    const completed = transitionPageCapabilityWorkflow(executing, {
      type: "execution.finished",
      capabilityId: "transfer_money",
      result: { outcome: "success", response: new Response(null, { status: 201 }) },
    });
    expect(completed.phase).toBe("completed");
  });

  it("rejects stale correlation, a changed reviewed snapshot, and duplicate execution", () => {
    const filling = fillingState();
    expect(
      isCorrelatedWorkflowResponse(filling, {
        eventId: "stale",
        conversationId: "conversation_1",
      }),
    ).toBe(false);
    expect(
      transitionPageCapabilityWorkflow(filling, {
        type: "proposal.accepted",
        correlation: { eventId: "stale", conversationId: "conversation_1" },
        capabilityId: "transfer_money",
        values: { recipient: "Stale" },
      }),
    ).toBe(filling);

    const confirming = transitionPageCapabilityWorkflow(filling, {
      type: "review.requested",
      capabilityId: "transfer_money",
      snapshot: { recipient: "Reviewed" },
    });
    expect(
      transitionPageCapabilityWorkflow(confirming, {
        type: "execution.requested",
        capabilityId: "transfer_money",
        snapshot: { recipient: "Changed" },
        confirmation: "required",
      }),
    ).toBe(confirming);

    const executing = transitionPageCapabilityWorkflow(confirming, {
      type: "execution.requested",
      capabilityId: "transfer_money",
      snapshot: { recipient: "Reviewed" },
      confirmation: "required",
    });
    expect(executing.phase).toBe("executing");
    expect(
      transitionPageCapabilityWorkflow(executing, {
        type: "execution.requested",
        capabilityId: "transfer_money",
        snapshot: { recipient: "Reviewed" },
        confirmation: "required",
      }),
    ).toBe(executing);
  });

  it("invalidates pending work when a run is cancelled", () => {
    const filling = fillingState();
    const cancelled = transitionPageCapabilityWorkflow(filling, {
      type: "cancel",
    });
    expect(cancelled.phase).toBe("idle");
    expect(
      transitionPageCapabilityWorkflow(cancelled, {
        type: "proposal.accepted",
        correlation,
        capabilityId: "transfer_money",
        values: { recipient: "Late" },
      }),
    ).toBe(cancelled);
  });

  it("returns a completed standalone assistant answer to idle", () => {
    const routing = transitionPageCapabilityWorkflow(
      INITIAL_PAGE_CAPABILITY_WORKFLOW,
      { type: "route.requested", request: routeRequest },
    );
    const answered = transitionPageCapabilityWorkflow(routing, {
      type: "message.answered",
      correlation,
    });

    expect(answered).toEqual({ phase: "idle", runId: 2 });
  });

  it("uses explicit read collection, fetch, presentation, empty, and stale-run transitions", () => {
    const routing = transitionPageCapabilityWorkflow(
      INITIAL_PAGE_CAPABILITY_WORKFLOW,
      { type: "route.requested", request: routeRequest },
    );
    const collecting = transitionPageCapabilityWorkflow(routing, {
      type: "route.matched",
      correlation,
      capabilityId: "show_product",
      capabilityKind: "read",
      readHasInput: true,
    });
    expect(collecting.phase).toBe("collecting");

    const fetching = transitionPageCapabilityWorkflow(collecting, {
      type: "read.execution.requested",
      runId: collecting.runId,
      capabilityId: "show_product",
      values: { productId: "42" },
    });
    expect(fetching.phase).toBe("fetching");

    const stale = transitionPageCapabilityWorkflow(fetching, {
      type: "read.execution.finished",
      runId: fetching.runId + 1,
      capabilityId: "show_product",
      result: {
        outcome: "success",
        response: Response.json({ title: "Stale" }),
        data: { title: "Stale" },
      },
    });
    expect(stale).toBe(fetching);

    const presenting = transitionPageCapabilityWorkflow(fetching, {
      type: "read.execution.finished",
      runId: fetching.runId,
      capabilityId: "show_product",
      result: {
        outcome: "success",
        response: Response.json({ title: "Product" }),
        data: { title: "Product" },
      },
    });
    expect(presenting.phase).toBe("presenting");

    const zeroInputRouting = transitionPageCapabilityWorkflow(
      INITIAL_PAGE_CAPABILITY_WORKFLOW,
      { type: "route.requested", request: routeRequest },
    );
    const zeroInputFetching = transitionPageCapabilityWorkflow(zeroInputRouting, {
      type: "route.matched",
      correlation,
      capabilityId: "list_products",
      capabilityKind: "read",
      readHasInput: false,
    });
    expect(zeroInputFetching.phase).toBe("fetching");
    const empty = transitionPageCapabilityWorkflow(zeroInputFetching, {
      type: "read.execution.finished",
      runId: zeroInputFetching.runId,
      capabilityId: "list_products",
      result: {
        outcome: "success",
        response: Response.json([]),
        data: [],
      },
    });
    expect(empty.phase).toBe("empty");
  });
});
