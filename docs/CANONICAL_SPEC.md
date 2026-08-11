# Canonical Compiled Mashala Spec v0.2

## Purpose and authority

This document is the normative shape of the JSON-serializable artifact produced by the developer-facing DSL. It defines the smallest contract needed by a capability router, JSON Schema validator, deterministic form renderer, and browser-side target-backend executor.

ADR-012 records the original canonical shape, and ADR-016 adds the explicit model-visible projection descriptor. The executable contract lives in `src/spec.ts`; `src/capabilities.ts` implements capability authoring, and `src/examples/transfer-money.ts` is the executable counterpart of the complete example below.

## TypeScript contract

These types describe the canonical JSON shape. They do not imply that the application has been implemented.

```ts
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A JSON Schema Draft 2020-12 document or subschema. */
export type JsonSchema202012 = JsonObject;

export interface MashalaSpec {
  readonly specVersion: "0.2";
  readonly app: AppMetadata;
  readonly capabilities: readonly CapabilitySpec[];
}

export interface AppMetadata {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CapabilitySpec {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;

  /** Natural-language description supplied to capability routing. */
  readonly description: string;

  readonly form: FormDefinition;
  readonly operation: BackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

export interface FormDefinition {
  /** The sole canonical source of deterministic input validation. */
  readonly schema: FormObjectSchema;

  /** Mashala rendering/runtime metadata, keyed by schema property name. */
  readonly fields: Readonly<Record<string, FieldMetadata>>;
}

export interface FormObjectSchema {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly $id?: string;
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchema202012>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export interface FieldPresentationBase {
  readonly label: string;
  readonly helpText?: string;
}

export interface TextFieldMetadata extends FieldPresentationBase {
  readonly kind: "text";
}

export interface LongTextFieldMetadata extends FieldPresentationBase {
  readonly kind: "longText";
}

export interface NumberFieldMetadata extends FieldPresentationBase {
  readonly kind: "number";
}

export interface SelectFieldMetadata extends FieldPresentationBase {
  readonly kind: "select";

  /** Labels keyed by the string values in the schema's enum. */
  readonly optionLabels: Readonly<Record<string, string>>;
}

export interface BooleanFieldMetadata extends FieldPresentationBase {
  readonly kind: "boolean";
}

export interface ReferenceFieldMetadata extends FieldPresentationBase {
  readonly kind: "reference";

  readonly source: {
    readonly method: "GET";

    /** Root-relative target-backend path; no origin, headers, or credentials. */
    readonly path: string;

    /** Optional ADR-016 browser-side model-context allowlist. */
    readonly modelContext?: ModelVisibleBackendProjection;
  };

  /** Direct response-item property projected as the submitted string value. */
  readonly value: string;

  /** Direct response-item property projected as the user-visible label. */
  readonly labelFrom: string;
}

export type FieldMetadata =
  | TextFieldMetadata
  | LongTextFieldMetadata
  | NumberFieldMetadata
  | SelectFieldMetadata
  | BooleanFieldMetadata
  | ReferenceFieldMetadata;

export interface BackendOperation {
  readonly method: "POST" | "PUT" | "PATCH";

  /** Relative target-backend path beginning with `/`; no origin or headers. */
  readonly path: string;
}

export type ConfirmationPolicy = "required" | "none";

export type ModelContextPurpose =
  | "reference_resolution"
  | "result_interpretation";

export interface ModelVisibleBackendProjection {
  readonly purpose: ModelContextPurpose;

  /** Output property name -> direct backend-result source property name. */
  readonly fields: Readonly<Record<string, string>>;
}

export type ModelVisibleDataPolicy = ModelVisibleBackendProjection;
```

`JsonSchema202012` is intentionally an open JSON object type: JSON Schema is the validation vocabulary, and Mashala should not maintain a partial competing TypeScript reimplementation of that vocabulary. The narrower `FormObjectSchema` fixes the form-root requirements that Mashala relies on.

## Normative invariants

A compiled v0.2 spec is valid only when all of the following hold:

1. `specVersion` is exactly `"0.2"`.
2. App and capability IDs match `^[a-z][a-z0-9_]*$`. Capability IDs are unique and remain stable once published.
3. Every `form.fields` key exists in `form.schema.properties`, and every schema property has exactly one field-metadata entry. Unknown metadata keys are invalid.
4. Every name in `schema.required` exists in `schema.properties`.
5. The field `kind` is compatible with its property schema:
   - `text` and `longText` use a string schema;
   - `number` uses a number or integer schema;
   - `select` uses a string schema with `enum`;
   - `boolean` uses a boolean schema;
   - `reference` uses a string schema. Its dynamically resolved allowed-value set is enforced in addition to full-form JSON Schema validation.
6. A select's `optionLabels` keys exactly match its schema enum values. This mapping exists only to attach presentation labels; the schema enum is authoritative for validation.
7. A reference has exactly one source containing `method: "GET"`, a root-relative target-backend path, and optionally one ADR-016 `modelContext` descriptor. It contains no headers, credentials, functions, or model instructions. `value` and `labelFrom` name direct response-item properties; cascading/dependent sources are absent.
8. A successful reference response is a root array. Every item must be an object whose declared value and label properties are non-empty strings, and projected values must be unique. Any malformed item rejects the response rather than producing a partial or invented option set.
9. The form root uses `additionalProperties: false`.
10. `operation.path` begins with `/` and is relative to the developer-configured target-backend base URL. It contains no origin, query mapping, header, or credential.
11. A capability's request body is JSON. Each validated form property is copied to the same-named request-body property. No implicit renaming or transformation occurs.
12. A capability that can cause a consequential side effect uses `confirmation: "required"`.
13. `source.modelContext.fields` maps projected output names to direct source property names. It must select at least one property, may rename properties, and supports only a root object or root array of objects. Nested paths, expressions, functions, filtering, joins, and computed fields are absent.
14. Absence of `source.modelContext` never authorizes forwarding backend data. A malformed descriptor/result, a non-serializable selected value, or prohibited credential/authentication data produces no model-visible result.

The future compiler and runtime must validate the compiled spec before use. LLM output never changes these declarations.

## Validation versus Mashala metadata

JSON Schema owns required/optional status, primitive type, string length, numeric limits, enum membership, and other deterministic constraints. Mashala metadata owns rendering choices and human-facing labels/help.

For example, `maxLength` belongs only in the property schema. It must not also appear in `LongTextFieldMetadata`. Likewise, `required` belongs only in the schema's `required` array.

Static select values appear in the schema enum. `optionLabels` repeats the enum keys only because a renderer needs an unambiguous value-to-label mapping; it is not a second allowed-values list.

## Backend request mapping

Capability operations are deliberately limited to body-based `POST`, `PUT`, and `PATCH` requests. After the browser validates a complete form and obtains any required confirmation, it constructs one JSON object from the form values without renaming keys:

```text
form value `amount`       -> JSON body property `amount`
form value `recipient`    -> JSON body property `recipient`
```

The browser then calls `operation.path` directly on the target backend using the target application's browser-side authentication integration. Authentication headers, cookies, tokens, and other credentials are not part of the compiled spec.

Path parameters, query parameters, custom headers, non-JSON bodies, request-field renaming, computed values, and general response transformation remain limitations. They must be added only in response to a concrete requirement; ADR-016's direct-property allowlist is not a generic transformation DSL.

## Complete compiled example

This example uses every static field kind. It is a compiled JSON artifact, not DSL source.

```json
{
  "specVersion": "0.2",
  "app": {
    "id": "mashala_bank_demo",
    "name": "Mashala Bank Demo",
    "description": "A demonstration application for common retail banking tasks."
  },
  "capabilities": [
    {
      "id": "transfer_money",
      "description": "Transfer money to a recipient from the user's account.",
      "form": {
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "properties": {
            "recipient": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "amount": {
              "type": "number",
              "minimum": 0.01
            },
            "note": {
              "type": "string",
              "maxLength": 140
            },
            "speed": {
              "type": "string",
              "enum": ["standard", "instant"]
            },
            "saveRecipient": {
              "type": "boolean"
            }
          },
          "required": ["recipient", "amount", "speed"],
          "additionalProperties": false
        },
        "fields": {
          "recipient": {
            "kind": "text",
            "label": "Recipient",
            "helpText": "Enter the recipient name or identifier."
          },
          "amount": {
            "kind": "number",
            "label": "Amount"
          },
          "note": {
            "kind": "longText",
            "label": "Note",
            "helpText": "Optional note shown with the transfer."
          },
          "speed": {
            "kind": "select",
            "label": "Transfer speed",
            "optionLabels": {
              "standard": "Standard",
              "instant": "Instant"
            }
          },
          "saveRecipient": {
            "kind": "boolean",
            "label": "Save this recipient"
          }
        }
      },
      "operation": {
        "method": "POST",
        "path": "/transfers"
      },
      "confirmation": "required"
    }
  ]
}
```

A renderer reads `fields`; a validator reads `schema`; a router reads capability IDs and descriptions; and the browser executor reads `operation` only after schema validation and confirmation.

## Data-backed/reference fields

`f.reference` compiles into the `ReferenceFieldMetadata` union member shown above. Its single declared GET runs directly from the browser against the target backend. A successful root-array response is projected deterministically through the named `value` and `labelFrom` properties into `{ value, label }` options. The model does not generate these options, and the complete response is never sent to the Mashala server.

The associated JSON Schema property validates the selected primitive as a string. Before submission, the browser additionally requires the value to be present in that field's successfully resolved option set, then runs the unchanged full-form JSON Schema validation. Loading or failed resolution cannot authorize an unresolved value.

The browser request boundary accepts an injected `TargetBackendRequest` function supplied by the target application. Confirmed writes and reference reads use this same browser-side behavior, which may apply the target application's existing session mechanism without putting headers, credentials, or functions in canonical data. Ordinary browser `fetch` remains the default. Cascading/dependent references remain deferred.

## Model-visible backend projection

ADR-016 resolves ADR-010's open mechanism with an optional declarative `source.modelContext` descriptor. Its `fields` object maps each output property to one direct property on the browser-fetched root object or each object in a root array:

```ts
modelContext: {
  purpose: "reference_resolution",
  fields: { id: "id", label: "masked" }
}
```

The browser copies only those properties, clones them as plain JSON, rejects credential-like declarations or selected nested credential data, and constructs `backend.context.selected` only from the minimized result. Missing policy or any projection failure creates no event. The server validates the event again and supplies its data to the LLM only as untrusted contextual input; it cannot alter capability identity, operations, confirmation, validation, authorization, workflow, or execution.

## Versioning

The ADR-016 policy changes the compiled artifact from v0.1 to v0.2. Additive details that older consumers can safely ignore may fit a compatible document revision, but changing a required property, request mapping, or projection semantics requires another spec version and an ADR. A consumer must reject an unsupported `specVersion` rather than guessing.
