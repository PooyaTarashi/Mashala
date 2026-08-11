export interface FieldPresentationConfig {
  readonly label: string;
  readonly helpText?: string;
}

export interface FieldConfigBase extends FieldPresentationConfig {
  /** Fields are optional unless explicitly marked as required. */
  readonly required?: boolean;
}

export interface StringFieldConfig extends FieldConfigBase {
  readonly minLength?: number;
  readonly maxLength?: number;
}

export type TextFieldConfig = StringFieldConfig;
export type LongTextFieldConfig = StringFieldConfig;

export interface NumberFieldConfig extends FieldConfigBase {
  readonly minimum?: number;
  readonly maximum?: number;
}

export type BooleanFieldConfig = FieldConfigBase;

export interface SelectOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
}

export interface SelectFieldConfig<
  Options extends readonly SelectOption[] = readonly SelectOption[],
> extends FieldPresentationConfig {
  readonly options: Options;
  readonly required?: boolean;
}

export interface ReferenceSourceConfig {
  readonly method: "GET";
  /** Root-relative target-backend path. */
  readonly path: string;
}

export interface ReferenceFieldConfig extends FieldConfigBase {
  readonly source: ReferenceSourceConfig;
  /** Direct property name projected as the submitted string value. */
  readonly value: string;
  /** Direct property name projected as the user-visible label. */
  readonly labelFrom: string;
}

export interface FieldDefinitionBase {
  readonly label: string;
  readonly helpText?: string;
  /** Authoring-only; compiled forms represent this in schema.required. */
  readonly required?: true;
}

export interface TextFieldDefinition extends FieldDefinitionBase {
  readonly kind: "text";
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface LongTextFieldDefinition extends FieldDefinitionBase {
  readonly kind: "longText";
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface NumberFieldDefinition extends FieldDefinitionBase {
  readonly kind: "number";
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface SelectFieldDefinition<Value extends string = string>
  extends FieldDefinitionBase {
  readonly kind: "select";
  readonly optionLabels: Readonly<Record<Value, string>>;
}

export interface BooleanFieldDefinition extends FieldDefinitionBase {
  readonly kind: "boolean";
}

export interface ReferenceFieldDefinition extends FieldDefinitionBase {
  readonly kind: "reference";
  readonly source: Readonly<ReferenceSourceConfig>;
  readonly value: string;
  readonly labelFrom: string;
}

export type StaticFieldDefinition =
  | TextFieldDefinition
  | LongTextFieldDefinition
  | NumberFieldDefinition
  | SelectFieldDefinition
  | BooleanFieldDefinition;

export type FieldDefinition = StaticFieldDefinition | ReferenceFieldDefinition;

export type FieldKind = FieldDefinition["kind"];

function createField<
  Kind extends Exclude<FieldKind, "select" | "reference">,
  Extra extends Readonly<Record<string, number>>,
>(
  kind: Kind,
  config: FieldConfigBase,
  extra: Extra,
): Readonly<FieldDefinitionBase & { readonly kind: Kind } & Extra> {
  const definition = {
    kind,
    label: config.label,
    ...(config.helpText === undefined ? {} : { helpText: config.helpText }),
    ...(config.required === true ? { required: true as const } : {}),
    ...extra,
  };

  return Object.freeze(definition);
}

function invalidReference(message: string): never {
  throw new TypeError(`Invalid reference field: ${message}`);
}

function assertReferencePath(path: unknown): asserts path is string {
  if (typeof path !== "string") {
    invalidReference("source path must be a string.");
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    invalidReference('source path must begin with exactly one "/".');
  }

  if (path.includes("\\")) {
    invalidReference("source path must remain within the target backend origin.");
  }

  if (path.includes("?")) {
    invalidReference("source path must not contain a query string.");
  }

  if (path.includes("#")) {
    invalidReference("source path must not contain a fragment.");
  }
}

function reference(config: ReferenceFieldConfig): ReferenceFieldDefinition {
  if (config.source.method !== "GET") {
    invalidReference("source method must be GET.");
  }

  assertReferencePath(config.source.path);

  if (typeof config.value !== "string" || config.value.length === 0) {
    invalidReference("value must name a direct response-item property.");
  }

  if (typeof config.labelFrom !== "string" || config.labelFrom.length === 0) {
    invalidReference("labelFrom must name a direct response-item property.");
  }

  return Object.freeze({
    kind: "reference",
    label: config.label,
    ...(config.helpText === undefined ? {} : { helpText: config.helpText }),
    ...(config.required === true ? { required: true as const } : {}),
    source: Object.freeze({ method: "GET" as const, path: config.source.path }),
    value: config.value,
    labelFrom: config.labelFrom,
  });
}

function select<const Options extends readonly SelectOption[]>(
  config: SelectFieldConfig<Options>,
): SelectFieldDefinition<Options[number]["value"]> {
  type Value = Options[number]["value"];

  const optionLabels = Object.freeze(
    Object.fromEntries(
      config.options.map((option) => [option.value, option.label]),
    ) as Record<Value, string>,
  );

  const definition =
    {
      kind: "select" as const,
      label: config.label,
      ...(config.helpText === undefined ? {} : { helpText: config.helpText }),
      ...(config.required === true ? { required: true as const } : {}),
      optionLabels,
    };

  return Object.freeze(definition);
}

export const f = Object.freeze({
  text(config: TextFieldConfig): TextFieldDefinition {
    return createField("text", config, {
      ...(config.minLength === undefined
        ? {}
        : { minLength: config.minLength }),
      ...(config.maxLength === undefined
        ? {}
        : { maxLength: config.maxLength }),
    });
  },

  longText(config: LongTextFieldConfig): LongTextFieldDefinition {
    return createField("longText", config, {
      ...(config.minLength === undefined
        ? {}
        : { minLength: config.minLength }),
      ...(config.maxLength === undefined
        ? {}
        : { maxLength: config.maxLength }),
    });
  },

  number(config: NumberFieldConfig): NumberFieldDefinition {
    return createField("number", config, {
      ...(config.minimum === undefined ? {} : { minimum: config.minimum }),
      ...(config.maximum === undefined ? {} : { maximum: config.maximum }),
    });
  },

  select,

  reference,

  boolean(config: BooleanFieldConfig): BooleanFieldDefinition {
    return createField("boolean", config, {});
  },
});
