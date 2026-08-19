import type { FormDefinition, JsonSchema202012 } from "./forms";

export type {
  BooleanFieldMetadata,
  FieldMetadata,
  FieldPresentationBase,
  FormDefinition,
  FormObjectSchema,
  JsonObject,
  JsonPrimitive,
  JsonSchema202012,
  JsonValue,
  LongTextFieldMetadata,
  NumberFieldMetadata,
  ReferenceFieldMetadata,
  SelectFieldMetadata,
  TextFieldMetadata,
} from "./forms";
export type {
  ModelContextPurpose,
  ModelVisibleBackendProjection,
} from "./model-visible-backend-projection-policy";
import type { ModelVisibleBackendProjection as ModelVisibleBackendProjectionContract } from "./model-visible-backend-projection-policy";
import { copyModelVisibleBackendProjection } from "./model-visible-backend-projection-policy";

export interface MashalaSpec {
  readonly specVersion: "0.3";
  readonly app: AppMetadata;
  readonly capabilities: readonly CapabilitySpec[];
}

export interface AppMetadata {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CapabilityBase {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;

  /** Natural-language description supplied to capability routing. */
  readonly description: string;
}

export interface WriteCapabilitySpec<FieldName extends string = string>
  extends CapabilityBase {
  readonly kind: "write";
  readonly form: FormDefinition<FieldName>;
  readonly operation: WriteBackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

export interface ReadCapabilitySpec<FieldName extends string = string>
  extends CapabilityBase {
  readonly kind: "read";
  /** Omitted for a zero-input read. */
  readonly input?: FormDefinition<FieldName>;
  readonly operation: ReadBackendOperation;
  readonly result: ResultView;
}

export type CapabilitySpec<FieldName extends string = string> =
  | WriteCapabilitySpec<FieldName>
  | ReadCapabilitySpec<FieldName>;

export interface WriteBackendOperation {
  readonly method: "POST" | "PUT" | "PATCH";
  /** Root-relative path; no origin, query, headers, or credentials. */
  readonly path: string;
}

/** Compatibility alias for the existing write executor API. */
export type BackendOperation = WriteBackendOperation;

export interface ReadBackendOperation {
  readonly method: "GET";
  /** Root-relative path with optional declared `{placeholder}` tokens. */
  readonly path: string;
  readonly bindings?: ReadInputBindings;
  readonly modelContext?: ModelVisibleBackendProjectionContract;
}

export interface ReadInputBindings {
  /** Path placeholder name -> input property name. */
  readonly path?: Readonly<Record<string, string>>;
  /** Target query-parameter name -> input property name. */
  readonly query?: Readonly<Record<string, string>>;
}

export type ConfirmationPolicy = "required" | "none";

export type ResultView = CardResultView | CardListResultView;

export interface CardResultView {
  readonly kind: "card";
  readonly card: ResultCard;
}

export interface CardListResultView {
  readonly kind: "cardList";
  readonly card: ResultCard;
  readonly emptyText: string;
}

export interface ResultCard {
  readonly title: ResultText;
  readonly image?: ResultImage;
  readonly description?: ResultText;
  readonly facts?: readonly ResultFact[];
}

export type ResultText = FixedResultText | ResultPropertyValue;

export interface FixedResultText {
  readonly kind: "fixed";
  readonly text: string;
}

export interface ResultPropertyValue {
  readonly kind: "property";
  readonly property: string;
  readonly formatter: TextResultFormatter;
}

export interface ResultFact {
  readonly id: string;
  readonly label: string;
  readonly value: ResultPropertyValue;
}

export interface ResultImage {
  readonly source: {
    readonly kind: "property";
    readonly property: string;
    readonly formatter: ImageUrlResultFormatter;
  };
  readonly alt: string;
}

export type TextResultFormatter =
  | TextFormatter
  | NumberFormatter
  | CurrencyFormatter
  | DateFormatter
  | DateTimeFormatter;

export interface TextFormatter {
  readonly kind: "text";
}

export interface NumberFormatter {
  readonly kind: "number";
  readonly locale: string;
}

export interface CurrencyFormatter {
  readonly kind: "currency";
  readonly locale: string;
  readonly currency: string;
}

export interface DateFormatter {
  readonly kind: "date";
  readonly locale: string;
}

export interface DateTimeFormatter {
  readonly kind: "dateTime";
  readonly locale: string;
  readonly timeZone: string;
}

export interface ImageUrlResultFormatter {
  readonly kind: "imageUrl";
}

/** ADR-016's declarative direct-property projection policy. */
export type ModelVisibleDataPolicy = ModelVisibleBackendProjectionContract;

const SUPPORTED_WRITE_METHODS: readonly WriteBackendOperation["method"][] = [
  "POST",
  "PUT",
  "PATCH",
];
const PLACEHOLDER_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const QUERY_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function invalidOperation(message: string): never {
  throw new TypeError(`Invalid backend operation: ${message}`);
}

function assertRootRelativePath(path: unknown, allowPlaceholders: boolean): asserts path is string {
  if (typeof path !== "string") {
    invalidOperation("path must be a string.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    invalidOperation('path must begin with exactly one "/".');
  }
  if (path.includes("\\")) {
    invalidOperation("path must resolve within the supplied target backend origin.");
  }
  if (path.includes("?")) {
    invalidOperation("path must not contain a query string.");
  }
  if (path.includes("#")) {
    invalidOperation("path must not contain a fragment.");
  }

  const withoutPlaceholders = path.replaceAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, "");
  if (withoutPlaceholders.includes("{") || withoutPlaceholders.includes("}")) {
    invalidOperation("path contains a malformed placeholder.");
  }
  if (!allowPlaceholders && withoutPlaceholders !== path) {
    invalidOperation("write paths must not contain placeholders.");
  }
}

/** Runtime-checks serialized write-operation data before it controls a request. */
export function assertBackendOperation(
  operation: unknown,
): asserts operation is WriteBackendOperation {
  if (!isPlainRecord(operation)) {
    invalidOperation("expected an object containing only method and path.");
  }
  const keys = Object.keys(operation);
  if (keys.length !== 2 || !hasOwn(operation, "method") || !hasOwn(operation, "path")) {
    invalidOperation("expected an object containing only method and path.");
  }
  const method = operation.method;
  if (
    typeof method !== "string" ||
    !SUPPORTED_WRITE_METHODS.some((supportedMethod) => supportedMethod === method)
  ) {
    invalidOperation("method must be POST, PUT, or PATCH.");
  }
  assertRootRelativePath(operation.path, false);
}

function placeholderNames(path: string): readonly string[] {
  return [...path.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map(
    (match) => match[1] as string,
  );
}

function assertBindingRecord(
  value: unknown,
  kind: "path" | "query",
): asserts value is Readonly<Record<string, string>> {
  if (!isPlainRecord(value) || Object.keys(value).length === 0) {
    invalidOperation(`${kind} bindings must be a non-empty object.`);
  }
  for (const [urlName, inputName] of Object.entries(value)) {
    const validName = kind === "path" ? PLACEHOLDER_NAME.test(urlName) : QUERY_NAME.test(urlName);
    if (!validName || typeof inputName !== "string" || inputName.length === 0) {
      invalidOperation(`${kind} bindings must map valid URL names to input property names.`);
    }
  }
}

function scalarSchema(schema: JsonSchema202012 | undefined): boolean {
  return (
    schema !== undefined &&
    (schema.type === "string" ||
      schema.type === "number" ||
      schema.type === "integer" ||
      schema.type === "boolean") &&
    schema.type !== null
  );
}

/** Runtime-checks a serialized read operation and all input-binding invariants. */
export function assertReadBackendOperation(
  operation: unknown,
  input?: FormDefinition,
): asserts operation is ReadBackendOperation {
  if (!isPlainRecord(operation)) {
    invalidOperation("expected a declared GET operation object.");
  }
  const allowedKeys = ["method", "path", "bindings", "modelContext"];
  const keys = Object.keys(operation);
  if (
    !keys.every((key) => allowedKeys.includes(key)) ||
    !hasOwn(operation, "method") ||
    !hasOwn(operation, "path") ||
    operation.method !== "GET"
  ) {
    invalidOperation("read operations contain only GET, path, optional bindings, and optional modelContext.");
  }
  assertRootRelativePath(operation.path, true);

  if (operation.modelContext !== undefined) {
    try {
      copyModelVisibleBackendProjection(operation.modelContext);
    } catch {
      invalidOperation("modelContext must be a valid declarative projection.");
    }
  }

  const placeholders = placeholderNames(operation.path);
  if (new Set(placeholders).size !== placeholders.length) {
    invalidOperation("every path placeholder must appear exactly once.");
  }

  if (input === undefined) {
    if (placeholders.length > 0 || operation.bindings !== undefined) {
      invalidOperation("zero-input reads cannot declare placeholders or bindings.");
    }
    return;
  }

  const inputNames = Object.keys(input.schema.properties);
  if (inputNames.length === 0) {
    invalidOperation("a declared read input must contain at least one property.");
  }
  if (!isPlainRecord(operation.bindings)) {
    invalidOperation("a read with input must declare bindings.");
  }
  const bindingKeys = Object.keys(operation.bindings);
  if (
    bindingKeys.length === 0 ||
    !bindingKeys.every((key) => key === "path" || key === "query")
  ) {
    invalidOperation("bindings may contain only path and query maps.");
  }

  const pathBindings = operation.bindings.path;
  const queryBindings = operation.bindings.query;
  if (pathBindings !== undefined) {
    assertBindingRecord(pathBindings, "path");
  }
  if (queryBindings !== undefined) {
    assertBindingRecord(queryBindings, "query");
  }
  if (pathBindings === undefined && queryBindings === undefined) {
    invalidOperation("bindings must declare at least one path or query map.");
  }

  const pathNames = pathBindings === undefined ? [] : Object.keys(pathBindings);
  if (
    pathNames.length !== placeholders.length ||
    pathNames.some((name) => !placeholders.includes(name))
  ) {
    invalidOperation("path binding keys must exactly match the declared placeholders.");
  }

  const boundInputNames = [
    ...(pathBindings === undefined ? [] : Object.values(pathBindings)),
    ...(queryBindings === undefined ? [] : Object.values(queryBindings)),
  ];
  if (
    boundInputNames.length !== inputNames.length ||
    new Set(boundInputNames).size !== boundInputNames.length ||
    boundInputNames.some((name) => !inputNames.includes(name))
  ) {
    invalidOperation("every input property must be bound exactly once and undeclared properties are forbidden.");
  }

  const required = new Set(input.schema.required ?? []);
  for (const inputName of boundInputNames) {
    if (!scalarSchema(input.schema.properties[inputName])) {
      invalidOperation("URL-bound input schemas must be scalar string, number, integer, or boolean schemas.");
    }
  }
  for (const inputName of pathBindings === undefined ? [] : Object.values(pathBindings)) {
    if (!required.has(inputName)) {
      invalidOperation("path-bound input properties must be required.");
    }
  }
}

/** Runtime-checks serialized confirmation data before it controls execution. */
export function assertConfirmationPolicy(
  policy: unknown,
): asserts policy is ConfirmationPolicy {
  if (policy !== "required" && policy !== "none") {
    throw new TypeError(
      'Invalid confirmation policy: expected "required" or "none".',
    );
  }
}
