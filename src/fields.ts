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

export type StaticFieldDefinition =
  | TextFieldDefinition
  | LongTextFieldDefinition
  | NumberFieldDefinition
  | SelectFieldDefinition
  | BooleanFieldDefinition;

export type FieldKind = StaticFieldDefinition["kind"];

function createField<
  Kind extends Exclude<FieldKind, "select">,
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

  boolean(config: BooleanFieldConfig): BooleanFieldDefinition {
    return createField("boolean", config, {});
  },
});
