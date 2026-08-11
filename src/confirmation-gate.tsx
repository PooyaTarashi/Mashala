"use client";

import { useRef, useState } from "react";

import {
  type BackendOperationResult,
  executeBackendOperation,
} from "./backend-executor";
import {
  CompiledForm,
  type FormValue,
} from "./form-renderer";
import type { FieldMetadata, JsonValue } from "./forms";
import {
  assertConfirmationPolicy,
  type CapabilitySpec,
} from "./spec";
import styles from "./confirmation-gate.module.css";

export type { ConfirmationPolicy } from "./spec";

export interface ConfirmationGateProps<FieldName extends string = string> {
  readonly capability: CapabilitySpec<FieldName>;
  readonly baseUrl: string | URL;
  readonly initialValues?: FormValue<FieldName>;
  readonly fetchImpl?: typeof fetch;
  readonly onResult?: (result: BackendOperationResult) => void;
  readonly formId?: string;
  readonly submitLabel?: string;
}

type ValidatedSnapshot = Readonly<Record<string, JsonValue>>;

type ConfirmationState =
  | { readonly phase: "editing" }
  | { readonly phase: "reviewing"; readonly value: ValidatedSnapshot }
  | { readonly phase: "executing"; readonly value: ValidatedSnapshot }
  | {
      readonly phase: "complete";
      readonly value: ValidatedSnapshot;
      readonly result: BackendOperationResult;
    };

const DEFAULT_FORM_ID = "mashala-confirmation";

function assertNever(value: never): never {
  throw new Error(`Unsupported confirmation value: ${String(value)}`);
}

function snapshotValidatedValue(value: FormValue): ValidatedSnapshot {
  const snapshot: Record<string, JsonValue> = {};

  for (const name of Object.keys(value)) {
    const fieldValue = value[name];

    if (fieldValue !== undefined) {
      snapshot[name] = fieldValue;
    }
  }

  return Object.freeze(snapshot);
}

function reviewedValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "Not provided (omitted)";
  }

  return JSON.stringify(value);
}

function resultMessage(result: BackendOperationResult): string {
  switch (result.outcome) {
    case "success":
      return "The target backend accepted the request.";
    case "http-error":
      return `The target backend returned HTTP ${String(result.response.status)}.`;
    case "network-error":
      return "The target backend could not be reached.";
    default:
      return assertNever(result);
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function fieldEntries<FieldName extends string>(
  fields: Readonly<Record<FieldName, FieldMetadata>>,
): readonly (readonly [FieldName, FieldMetadata])[] {
  return Object.entries(fields) as [FieldName, FieldMetadata][];
}

export function ConfirmationGate<FieldName extends string>({
  capability,
  baseUrl,
  initialValues,
  fetchImpl,
  onResult,
  formId = DEFAULT_FORM_ID,
  submitLabel = "Submit",
}: ConfirmationGateProps<FieldName>) {
  const { form, operation, confirmation } = capability;
  assertConfirmationPolicy(confirmation);

  const [state, setState] = useState<ConfirmationState>({ phase: "editing" });
  const executionPending = useRef(false);
  const reviewHeadingId = `${formId}-review-heading`;
  const resultHeadingId = `${formId}-result-heading`;

  async function execute(value: ValidatedSnapshot): Promise<void> {
    if (executionPending.current) {
      return;
    }

    executionPending.current = true;
    setState({ phase: "executing", value });

    try {
      const result = await executeBackendOperation({
        baseUrl,
        operation,
        value,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      });

      setState({ phase: "complete", value, result });
      onResult?.(result);
    } finally {
      executionPending.current = false;
    }
  }

  function handleValidatedSubmit(value: FormValue<FieldName>): void {
    const snapshot = snapshotValidatedValue(value);

    switch (confirmation) {
      case "required":
        setState({ phase: "reviewing", value: snapshot });
        return;
      case "none":
        void execute(snapshot);
        return;
      default:
        return assertNever(confirmation);
    }
  }

  function handleConfirm(): void {
    if (state.phase === "reviewing") {
      void execute(state.value);
    }
  }

  function handleBack(): void {
    if (state.phase === "reviewing") {
      setState({ phase: "editing" });
    }
  }

  const isEditing = state.phase === "editing";
  const isReviewVisible =
    state.phase === "reviewing" || state.phase === "executing";

  return (
    <div className={styles.gate}>
      <div hidden={!isEditing}>
        <CompiledForm
          form={form}
          initialValues={initialValues}
          onSubmit={handleValidatedSubmit}
          submitLabel={submitLabel}
          formId={formId}
          baseUrl={baseUrl}
          fetchImpl={fetchImpl}
        />
      </div>

      {isReviewVisible ? (
        <section
          className={styles.panel}
          aria-labelledby={reviewHeadingId}
          aria-busy={state.phase === "executing"}
        >
          <h2 id={reviewHeadingId}>Review and confirm</h2>
          <dl className={styles.reviewList}>
            {fieldEntries(form.fields).map(([name, metadata]) => (
              <div className={styles.reviewField} key={name}>
                <dt>{metadata.label}</dt>
                <dd>
                  {reviewedValue(
                    hasOwn(state.value, name) ? state.value[name] : undefined,
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className={styles.status} role="status" aria-live="polite">
            {state.phase === "executing" ? "Request pending." : ""}
          </p>

          <div className={styles.actions}>
            <button
              className={styles.confirm}
              type="button"
              disabled={state.phase === "executing"}
              onClick={handleConfirm}
            >
              Confirm and send
            </button>
            <button
              className={styles.back}
              type="button"
              disabled={state.phase === "executing"}
              onClick={handleBack}
            >
              Back to form
            </button>
          </div>
        </section>
      ) : null}

      {state.phase === "complete" ? (
        <section className={styles.panel} aria-labelledby={resultHeadingId}>
          <h2 id={resultHeadingId}>Request result</h2>
          <p role="status">{resultMessage(state.result)}</p>
        </section>
      ) : null}
    </div>
  );
}
