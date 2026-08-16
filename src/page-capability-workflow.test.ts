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
});
