import type { BackendOperationResult } from "./backend-executor";
import type { FormValue } from "./form-renderer";
import type { ReadCapabilityResult } from "./read-capability-executor";
import type { JsonValue } from "./spec";
import type { PersistedConversationWorkflow } from "./conversation-store";

export type PageWorkflowPhase =
  | "idle"
  | "routing"
  | "filling"
  | "collecting"
  | "confirming"
  | "executing"
  | "fetching"
  | "presenting"
  | "empty"
  | "completed"
  | "failed";

export interface WorkflowCorrelation {
  readonly eventId: string;
  readonly conversationId: string;
}

export interface PendingWorkflowRequest extends WorkflowCorrelation {
  readonly kind: "route" | "extraction" | "backend-context";
}

interface CapabilityRun {
  readonly runId: number;
  readonly capabilityId: string;
  readonly values: FormValue;
  readonly formRevision: number;
}

type InputPhase = "filling" | "collecting";

type SuccessfulReadResult = Extract<ReadCapabilityResult, { outcome: "success" }>;
type FailedReadResult = Exclude<
  ReadCapabilityResult,
  { outcome: "success" | "input-required" }
>;

export type PageCapabilityWorkflow =
  | {
      readonly phase: "idle";
      readonly runId: number;
    }
  | {
      readonly phase: "routing";
      readonly runId: number;
      readonly request: PendingWorkflowRequest;
    }
  | (CapabilityRun & {
      readonly phase: InputPhase;
      readonly pendingRequests: readonly PendingWorkflowRequest[];
    })
  | (CapabilityRun & {
      readonly phase: "confirming";
      readonly reviewedSnapshot: Readonly<Record<string, JsonValue>>;
    })
  | (CapabilityRun & {
      readonly phase: "executing";
      readonly reviewedSnapshot: Readonly<Record<string, JsonValue>>;
    })
  | (CapabilityRun & {
      readonly phase: "completed";
      readonly reviewedSnapshot: Readonly<Record<string, JsonValue>>;
      readonly result: Extract<BackendOperationResult, { outcome: "success" }>;
    })
  | (CapabilityRun & {
      readonly phase: "failed";
      readonly reviewedSnapshot: Readonly<Record<string, JsonValue>>;
      readonly result: Exclude<BackendOperationResult, { outcome: "success" }>;
    })
  | (CapabilityRun & {
      readonly phase: "fetching";
    })
  | (CapabilityRun & {
      readonly phase: "presenting";
      readonly result: SuccessfulReadResult;
    })
  | (CapabilityRun & {
      readonly phase: "empty";
      readonly result: SuccessfulReadResult;
    })
  | (CapabilityRun & {
      readonly phase: "failed";
      readonly result: FailedReadResult;
    })
  | {
      readonly phase: "failed";
      readonly runId: number;
      readonly failure: "runtime";
    };

export type PageWorkflowAction =
  | {
      readonly type: "route.requested";
      readonly request: PendingWorkflowRequest;
    }
  | {
      readonly type: "route.matched";
      readonly correlation: WorkflowCorrelation;
      readonly capabilityId: string;
      readonly capabilityKind: "write" | "read";
      readonly readHasInput?: boolean;
    }
  | {
      readonly type: "extraction.requested";
      readonly request: PendingWorkflowRequest;
      readonly capabilityId: string;
      readonly supersedePending: boolean;
    }
  | {
      readonly type: "proposal.accepted";
      readonly correlation: WorkflowCorrelation;
      readonly capabilityId: string;
      readonly values: FormValue;
    }
  | {
      readonly type: "response.finished";
      readonly correlation: WorkflowCorrelation;
    }
  | {
      readonly type: "routing.failed";
      readonly correlation: WorkflowCorrelation;
    }
  | {
      readonly type: "route.out_of_scope";
      readonly correlation: WorkflowCorrelation;
    }
  | {
      readonly type: "message.answered";
      readonly correlation: WorkflowCorrelation;
    }
  | {
      readonly type: "draft.changed";
      readonly capabilityId: string;
      readonly values: FormValue;
    }
  | {
      readonly type: "review.requested";
      readonly capabilityId: string;
      readonly snapshot: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly type: "review.cancelled";
      readonly capabilityId: string;
    }
  | {
      readonly type: "execution.requested";
      readonly capabilityId: string;
      readonly snapshot: Readonly<Record<string, JsonValue>>;
      readonly confirmation: "required" | "none";
    }
  | {
      readonly type: "execution.finished";
      readonly capabilityId: string;
      readonly result: BackendOperationResult;
    }
  | {
      readonly type: "read.execution.requested";
      readonly runId: number;
      readonly capabilityId: string;
      readonly values: FormValue;
    }
  | {
      readonly type: "read.execution.finished";
      readonly runId: number;
      readonly capabilityId: string;
      readonly result: ReadCapabilityResult;
    }
  | { readonly type: "cancel" }
  | { readonly type: "reset" };

export const INITIAL_PAGE_CAPABILITY_WORKFLOW: PageCapabilityWorkflow =
  Object.freeze({ phase: "idle", runId: 0 });

/**
 * Reconstructs only ADR-018's already-validated resumable phases. Pending
 * requests, confirmation snapshots, execution authority, and backend results
 * have no representation here.
 */
export function restorePageCapabilityWorkflow(
  workflow: PersistedConversationWorkflow,
  runId: number,
): PageCapabilityWorkflow {
  if (workflow.phase === "idle") {
    return Object.freeze({ phase: "idle", runId });
  }
  const values: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(workflow.draft ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      values[name] = value;
    }
  }
  return Object.freeze({
    phase: workflow.phase,
    runId,
    capabilityId: workflow.capabilityId,
    values: Object.freeze(values),
    formRevision: 0,
    pendingRequests: Object.freeze([]),
  });
}

function sameCorrelation(
  left: WorkflowCorrelation,
  right: WorkflowCorrelation,
): boolean {
  return (
    left.eventId === right.eventId &&
    left.conversationId === right.conversationId
  );
}

function matchingPendingRequest(
  state: Extract<PageCapabilityWorkflow, { phase: InputPhase }>,
  correlation: WorkflowCorrelation,
): PendingWorkflowRequest | undefined {
  return state.pendingRequests.find((request) =>
    sameCorrelation(request, correlation),
  );
}

function isolatedValues(values: FormValue): FormValue {
  return Object.freeze({ ...values });
}

function sameSnapshot(
  left: Readonly<Record<string, JsonValue>>,
  right: Readonly<Record<string, JsonValue>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        JSON.stringify(left[key]) === JSON.stringify(right[key]),
    )
  );
}

function idleAfter(state: PageCapabilityWorkflow): PageCapabilityWorkflow {
  return Object.freeze({ phase: "idle", runId: state.runId + 1 });
}

/**
 * The sole legal-transition table for one page-level capability run. Invalid,
 * stale, cancelled, or duplicate actions are ignored by returning the same
 * state object.
 */
export function transitionPageCapabilityWorkflow(
  state: PageCapabilityWorkflow,
  action: PageWorkflowAction,
): PageCapabilityWorkflow {
  switch (action.type) {
    case "route.requested":
      if (
        state.phase !== "idle" &&
        state.phase !== "completed" &&
        state.phase !== "failed"
      ) {
        return state;
      }
      return Object.freeze({
        phase: "routing",
        runId: state.runId + 1,
        request: action.request,
      });

    case "route.matched":
      if (
        state.phase !== "routing" ||
        !sameCorrelation(state.request, action.correlation)
      ) {
        return state;
      }
      return Object.freeze({
        phase:
          action.capabilityKind === "read"
            ? action.readHasInput === true
              ? "collecting"
              : "fetching"
            : "filling",
        runId: state.runId,
        capabilityId: action.capabilityId,
        values: Object.freeze({}),
        formRevision: 0,
        pendingRequests: Object.freeze([state.request]),
      });

    case "extraction.requested":
      if (
        (state.phase !== "filling" && state.phase !== "collecting") ||
        state.capabilityId !== action.capabilityId ||
        state.pendingRequests.some(
          (request) => request.eventId === action.request.eventId,
        )
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        pendingRequests: Object.freeze(
          action.supersedePending
            ? [action.request]
            : [...state.pendingRequests, action.request],
        ),
      });

    case "proposal.accepted":
      if (
        (state.phase !== "filling" && state.phase !== "collecting") ||
        state.capabilityId !== action.capabilityId ||
        matchingPendingRequest(state, action.correlation) === undefined
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        values: isolatedValues(action.values),
        formRevision: state.formRevision + 1,
      });

    case "response.finished":
      if (state.phase === "routing") {
        return sameCorrelation(state.request, action.correlation)
          ? Object.freeze({
              phase: "failed",
              runId: state.runId,
              failure: "runtime",
            })
          : state;
      }
      if (state.phase !== "filling" && state.phase !== "collecting") {
        return state;
      }
      if (matchingPendingRequest(state, action.correlation) === undefined) {
        return state;
      }
      return Object.freeze({
        ...state,
        pendingRequests: Object.freeze(
          state.pendingRequests.filter(
            (request) => !sameCorrelation(request, action.correlation),
          ),
        ),
      });

    case "routing.failed":
      if (
        state.phase === "routing" &&
        sameCorrelation(state.request, action.correlation)
      ) {
        return Object.freeze({
          phase: "failed",
          runId: state.runId,
          failure: "runtime",
        });
      }
      if (
        (state.phase === "filling" || state.phase === "collecting") &&
        matchingPendingRequest(state, action.correlation) !== undefined
      ) {
        return transitionPageCapabilityWorkflow(state, {
          type: "response.finished",
          correlation: action.correlation,
        });
      }
      return state;

    case "route.out_of_scope":
      return state.phase === "routing" &&
        sameCorrelation(state.request, action.correlation)
        ? idleAfter(state)
        : state;

    case "message.answered":
      return state.phase === "routing" &&
        sameCorrelation(state.request, action.correlation)
        ? idleAfter(state)
        : state;

    case "draft.changed":
      if (
        (state.phase !== "filling" && state.phase !== "collecting") ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      return Object.freeze({ ...state, values: isolatedValues(action.values) });

    case "review.requested":
      if (
        state.phase !== "filling" ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      return Object.freeze({
        phase: "confirming",
        runId: state.runId,
        capabilityId: state.capabilityId,
        values: state.values,
        formRevision: state.formRevision,
        reviewedSnapshot: Object.freeze({ ...action.snapshot }),
      });

    case "review.cancelled":
      if (
        state.phase !== "confirming" ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      return Object.freeze({
        phase: "filling",
        runId: state.runId,
        capabilityId: state.capabilityId,
        values: state.values,
        formRevision: state.formRevision,
        pendingRequests: Object.freeze([]),
      });

    case "execution.requested": {
      const legalRequiredExecution =
        action.confirmation === "required" &&
        state.phase === "confirming" &&
        state.capabilityId === action.capabilityId &&
        sameSnapshot(state.reviewedSnapshot, action.snapshot);
      const legalUnconfirmedExecution =
        action.confirmation === "none" &&
        state.phase === "filling" &&
        state.capabilityId === action.capabilityId;

      if (!legalRequiredExecution && !legalUnconfirmedExecution) {
        return state;
      }

      return Object.freeze({
        phase: "executing",
        runId: state.runId,
        capabilityId: state.capabilityId,
        values: state.values,
        formRevision: state.formRevision,
        reviewedSnapshot: Object.freeze({ ...action.snapshot }),
      });
    }

    case "execution.finished":
      if (
        state.phase !== "executing" ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      if (action.result.outcome === "success") {
        return Object.freeze({ ...state, phase: "completed", result: action.result });
      }
      return Object.freeze({ ...state, phase: "failed", result: action.result });

    case "read.execution.requested":
      if (
        state.phase !== "collecting" ||
        state.runId !== action.runId ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      return Object.freeze({
        phase: "fetching",
        runId: state.runId,
        capabilityId: state.capabilityId,
        values: isolatedValues(action.values),
        formRevision: state.formRevision,
      });

    case "read.execution.finished":
      if (
        state.phase !== "fetching" ||
        state.runId !== action.runId ||
        state.capabilityId !== action.capabilityId
      ) {
        return state;
      }
      if (action.result.outcome === "input-required") {
        return Object.freeze({
          ...state,
          phase: "collecting",
          pendingRequests: Object.freeze([]),
        });
      }
      if (action.result.outcome === "success") {
        const empty =
          Array.isArray(action.result.data) && action.result.data.length === 0;
        return Object.freeze({
          ...state,
          phase: empty ? "empty" : "presenting",
          result: action.result,
        });
      }
      return Object.freeze({
        ...state,
        phase: "failed",
        result: action.result,
      });

    case "cancel":
      return state.phase === "executing" ? state : idleAfter(state);

    case "reset":
      return state.phase === "completed" ||
        state.phase === "presenting" ||
        state.phase === "empty" ||
        state.phase === "failed"
        ? idleAfter(state)
        : state;
  }
}

export function isCorrelatedWorkflowResponse(
  state: PageCapabilityWorkflow,
  correlation: WorkflowCorrelation,
): boolean {
  if (state.phase === "routing") {
    return sameCorrelation(state.request, correlation);
  }
  return (
    (state.phase === "filling" || state.phase === "collecting") &&
    matchingPendingRequest(state, correlation) !== undefined
  );
}

export function activeWorkflowCapabilityId(
  state: PageCapabilityWorkflow,
): string | undefined {
  return "capabilityId" in state ? state.capabilityId : undefined;
}

export function workflowFormValues(state: PageCapabilityWorkflow): FormValue {
  return "values" in state ? state.values : Object.freeze({});
}
