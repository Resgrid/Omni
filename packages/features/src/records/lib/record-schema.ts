import { REDACTION_VALUE } from '@resgrid/auth';
import {
  type FieldRecordCatalogEntry,
  type RecordConditionSchema,
  type RecordDefinitionSchema,
  type RecordFieldSchema,
  type RecordSectionSchema,
  type RecordValueCellData,
  type RecordValueInput,
  RmsFieldClassification,
  RmsFieldType,
  RmsRuleEffect,
  RmsRuleOperator,
} from '@resgrid/models';

// Client-side schema helpers for the Field Records renderer (RMS plan RMS-1D; identical in the four legacy field apps).
// Rule evaluation must give the same answer as RecordTypedValuesService.EvaluateRules on the server: a rule inside a
// repeating section evaluates per row against that row's own cells, and the server revalidates everything on save.
// This is presentation, never authorization.

/** The controls this renderer can draw. A definition naming anything else fails closed. */
export const SUPPORTED_FIELD_TYPES: ReadonlySet<RmsFieldType> = new Set([
  RmsFieldType.ShortText,
  RmsFieldType.LongText,
  RmsFieldType.Integer,
  RmsFieldType.Decimal,
  RmsFieldType.Boolean,
  RmsFieldType.Date,
  RmsFieldType.DateTime,
  RmsFieldType.Duration,
  RmsFieldType.SingleSelect,
  RmsFieldType.MultiSelect,
  RmsFieldType.Address,
  RmsFieldType.Person,
  RmsFieldType.Unit,
  RmsFieldType.Group,
  RmsFieldType.Contact,
  RmsFieldType.Signature,
  RmsFieldType.ExternalReference,
  RmsFieldType.Currency,
  RmsFieldType.Quantity,
  RmsFieldType.CountrySubdivision,
  RmsFieldType.CallReference,
  RmsFieldType.Attachment,
]);

export const isSupportedField = (field: RecordFieldSchema): boolean => SUPPORTED_FIELD_TYPES.has(field.Type);

/** Field keys the renderer cannot draw; a definition with any is refused for authoring. */
export const unsupportedFieldKeys = (schema: RecordDefinitionSchema | null | undefined): string[] =>
  (schema?.Sections ?? []).flatMap((section) => (section.Fields ?? []).filter((field) => !isSupportedField(field)).map((field) => field.Key));

/** A value keyed by section, field and (for repeating sections) row. */
export type ValueMap = Record<string, RecordValueInput>;

export const cellKey = (sectionKey: string, fieldKey: string, rowKey?: string | null): string => `${sectionKey}::${rowKey ?? ''}::${fieldKey}`;

/** A cell the server withheld (ADP sealed or Restricted without the right): shown as protected, never posted back. */
export const isWithheldCell = (cell: Pick<RecordValueCellData, 'IsWithheld' | 'Value'>): boolean => cell.IsWithheld === true || cell.Value === REDACTION_VALUE;

export const toValueMap = (cells: RecordValueCellData[] | null | undefined): ValueMap => {
  const map: ValueMap = {};
  for (const cell of cells ?? []) {
    if (!cell?.FieldKey || !cell?.SectionKey || isWithheldCell(cell)) continue;
    map[cellKey(cell.SectionKey, cell.FieldKey, cell.RowKey)] = {
      SectionKey: cell.SectionKey,
      FieldKey: cell.FieldKey,
      RowKey: cell.RowKey ?? null,
      Ordinal: cell.Ordinal ?? 0,
      Value: cell.Value ?? null,
      Values: cell.Values ?? null,
      ReferenceType: cell.ReferenceType ?? null,
      ReferenceId: cell.ReferenceId ?? null,
      UnitCode: cell.UnitCode ?? null,
    };
  }
  return map;
};

/**
 * Cell keys the server withheld. Core carries a sealed row forward when nothing is posted for it ("a sealed row the
 * editor could not reveal posts nothing back"), so these cells are rendered disabled and left out of every save —
 * posting the sentinel would overwrite the protected value with the word "REDACTED".
 */
export const withheldCellKeys = (cells: RecordValueCellData[] | null | undefined): Set<string> => {
  const keys = new Set<string>();
  for (const cell of cells ?? []) {
    if (cell?.FieldKey && cell.SectionKey && isWithheldCell(cell)) keys.add(cellKey(cell.SectionKey, cell.FieldKey, cell.RowKey));
  }
  return keys;
};

export const isBlank = (value: RecordValueInput | undefined | null): boolean => {
  if (!value) return true;
  if (value.Values && value.Values.length > 0) return false;
  if (value.ReferenceId && value.ReferenceId.length > 0) return false;
  return value.Value === null || value.Value === undefined || value.Value.trim().length === 0;
};

/** The values to post: blanks dropped, and never a withheld cell or the redaction sentinel. */
export const toValueList = (values: ValueMap, withheld: ReadonlySet<string> = new Set()): RecordValueInput[] =>
  Object.entries(values)
    .filter(([key, value]) => !withheld.has(key) && value.Value !== REDACTION_VALUE && !isBlank(value))
    .map(([, value]) => value);

/** Row keys present for a repeating section, in stored order. */
export const rowKeysFor = (values: ValueMap, sectionKey: string): string[] => {
  const seen = new Map<string, number>();
  for (const value of Object.values(values)) {
    if (value.SectionKey !== sectionKey || !value.RowKey) continue;
    if (!seen.has(value.RowKey)) seen.set(value.RowKey, value.Ordinal ?? seen.size);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([key]) => key);
};

const scalarText = (value: RecordValueInput | undefined): string => {
  if (!value) return '';
  if (value.Values && value.Values.length > 0) return value.Values.join(',');
  return value.ReferenceId ?? value.Value ?? '';
};

const resolve = (values: ValueMap, schema: RecordDefinitionSchema, fieldKey: string, sectionKey: string, rowKey?: string | null): RecordValueInput | undefined => {
  // Inside a repeating row the row's own cell wins; otherwise fall back to the scalar value anywhere in the schema,
  // matching the server's Evaluate(condition, schema, values, depth, row).
  if (rowKey) {
    const own = values[cellKey(sectionKey, fieldKey, rowKey)];
    if (own) return own;
  }
  for (const section of schema.Sections ?? []) {
    if (section.Repeating) continue;
    const candidate = values[cellKey(section.Key, fieldKey, null)];
    if (candidate) return candidate;
  }
  return undefined;
};

const MAX_RULE_DEPTH = 5;

const sameText = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export const evaluateCondition = (condition: RecordConditionSchema | null | undefined, schema: RecordDefinitionSchema, values: ValueMap, sectionKey: string, rowKey?: string | null, depth = 0): boolean => {
  if (!condition || depth > MAX_RULE_DEPTH) return true;

  if (condition.Operator === RmsRuleOperator.And || condition.Operator === RmsRuleOperator.Or) {
    const children = condition.Conditions ?? [];
    if (children.length === 0) return true;
    return condition.Operator === RmsRuleOperator.And
      ? children.every((child) => evaluateCondition(child, schema, values, sectionKey, rowKey, depth + 1))
      : children.some((child) => evaluateCondition(child, schema, values, sectionKey, rowKey, depth + 1));
  }

  if (!condition.FieldKey) return true;

  const value = resolve(values, schema, condition.FieldKey, sectionKey, rowKey);
  const text = scalarText(value);
  const blank = isBlank(value);

  switch (condition.Operator) {
    case RmsRuleOperator.Equals:
      return sameText(text, condition.Value ?? '');
    case RmsRuleOperator.NotEquals:
      return !sameText(text, condition.Value ?? '');
    case RmsRuleOperator.InSet:
      return (condition.Values ?? []).some((candidate) => sameText(candidate, text));
    case RmsRuleOperator.NotInSet:
      return !(condition.Values ?? []).some((candidate) => sameText(candidate, text));
    case RmsRuleOperator.IsEmpty:
      return blank;
    case RmsRuleOperator.IsNotEmpty:
      return !blank;
    case RmsRuleOperator.InRange: {
      const numeric = Number.parseFloat(text);
      if (Number.isNaN(numeric)) return false;
      if (condition.Min !== null && condition.Min !== undefined && numeric < condition.Min) return false;
      if (condition.Max !== null && condition.Max !== undefined && numeric > condition.Max) return false;
      return true;
    }
    default:
      return true;
  }
};

export interface RuleState {
  hiddenFieldKeys: Set<string>;
  requiredFieldKeys: Set<string>;
  hiddenSectionKeys: Set<string>;
}

const evaluateFieldRules = (field: RecordFieldSchema, schema: RecordDefinitionSchema, values: ValueMap, sectionKey: string, rowKey: string | null, state: RuleState): void => {
  for (const rule of field.Rules ?? []) {
    const met = evaluateCondition(rule.Condition, schema, values, sectionKey, rowKey);
    const key = cellKey(sectionKey, field.Key, rowKey);
    if (rule.Effect === RmsRuleEffect.Show && !met) state.hiddenFieldKeys.add(key);
    if (rule.Effect === RmsRuleEffect.Require && met) state.requiredFieldKeys.add(key);
  }
};

/** Which fields are shown and which are required right now. Repeating sections evaluate per row, as the server does. */
export const evaluateRules = (schema: RecordDefinitionSchema | null | undefined, values: ValueMap): RuleState => {
  const state: RuleState = { hiddenFieldKeys: new Set(), requiredFieldKeys: new Set(), hiddenSectionKeys: new Set() };
  if (!schema) return state;

  for (const section of schema.Sections ?? []) {
    for (const rule of section.Rules ?? []) {
      if (rule.Effect === RmsRuleEffect.Show && !evaluateCondition(rule.Condition, schema, values, section.Key, null)) state.hiddenSectionKeys.add(section.Key);
    }
    if (state.hiddenSectionKeys.has(section.Key)) continue;

    if (section.Repeating) {
      for (const rowKey of rowKeysFor(values, section.Key)) {
        for (const field of section.Fields ?? []) evaluateFieldRules(field, schema, values, section.Key, rowKey, state);
      }
      continue;
    }
    for (const field of section.Fields ?? []) evaluateFieldRules(field, schema, values, section.Key, null, state);
  }
  return state;
};

export const isFieldHidden = (state: RuleState, sectionKey: string, fieldKey: string, rowKey?: string | null): boolean => state.hiddenFieldKeys.has(cellKey(sectionKey, fieldKey, rowKey ?? null));

export const isFieldRequired = (state: RuleState, field: RecordFieldSchema, sectionKey: string, rowKey?: string | null, forFinalize = false): boolean => {
  if (field.Required) return true;
  if (forFinalize && field.RequiredToFinalize) return true;
  return state.requiredFieldKeys.has(cellKey(sectionKey, field.Key, rowKey ?? null));
};

export interface ValidationIssue {
  sectionKey: string;
  fieldKey: string;
  rowKey: string | null;
  label: string;
  code: 'required' | 'range' | 'length';
}

const NUMERIC_TYPES: ReadonlySet<RmsFieldType> = new Set([RmsFieldType.Integer, RmsFieldType.Decimal, RmsFieldType.Currency, RmsFieldType.Quantity]);

/**
 * Local validation for immediate feedback; the server validates again and its answer wins. A withheld cell is never
 * reported as missing: its value exists on the server, the editor just cannot see it.
 */
export const validate = (schema: RecordDefinitionSchema | null | undefined, values: ValueMap, forFinalize: boolean, withheld: ReadonlySet<string> = new Set()): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!schema) return issues;
  const state = evaluateRules(schema, values);

  const checkField = (section: RecordSectionSchema, field: RecordFieldSchema, rowKey: string | null): void => {
    const key = cellKey(section.Key, field.Key, rowKey);
    if (isFieldHidden(state, section.Key, field.Key, rowKey) || withheld.has(key)) return;
    const value = values[key];
    if (isBlank(value)) {
      if (isFieldRequired(state, field, section.Key, rowKey, forFinalize)) issues.push({ sectionKey: section.Key, fieldKey: field.Key, rowKey, label: field.Label, code: 'required' });
      return;
    }
    if (NUMERIC_TYPES.has(field.Type)) {
      const numeric = Number.parseFloat(value?.Value ?? '');
      if (Number.isNaN(numeric) || (field.Min !== null && field.Min !== undefined && numeric < field.Min) || (field.Max !== null && field.Max !== undefined && numeric > field.Max)) {
        issues.push({ sectionKey: section.Key, fieldKey: field.Key, rowKey, label: field.Label, code: 'range' });
      }
    }
    if (field.MaxLength && (value?.Value?.length ?? 0) > field.MaxLength) issues.push({ sectionKey: section.Key, fieldKey: field.Key, rowKey, label: field.Label, code: 'length' });
  };

  for (const section of schema.Sections ?? []) {
    if (state.hiddenSectionKeys.has(section.Key)) continue;
    if (section.Repeating) {
      for (const rowKey of rowKeysFor(values, section.Key)) {
        for (const field of section.Fields ?? []) checkField(section, field, rowKey);
      }
      continue;
    }
    for (const field of section.Fields ?? []) checkField(section, field, null);
  }
  return issues;
};

/** Restricted and Protected fields carry a badge; a Protected field is authored only with a live grant. */
export const isRestricted = (field: RecordFieldSchema): boolean => field.Classification !== RmsFieldClassification.Standard;

/** True when this catalog entry may be authored without a connection (never a definition that seals values). */
export const canAuthorOffline = (entry: FieldRecordCatalogEntry | null | undefined): boolean => !!entry?.AllowOffline && !entry.RequiresProtectedGrant;

/** Values prefilled by the server, keyed for the form. */
export const prefillToValueMap = (prefilled: { SectionKey?: string | null; FieldKey: string; Value?: string | null; ReferenceType?: string | null; ReferenceId?: string | null }[]): ValueMap => {
  const map: ValueMap = {};
  for (const value of prefilled) {
    if (!value.SectionKey) continue;
    map[cellKey(value.SectionKey, value.FieldKey, null)] = {
      SectionKey: value.SectionKey,
      FieldKey: value.FieldKey,
      RowKey: null,
      Value: value.Value ?? null,
      ReferenceType: value.ReferenceType ?? null,
      ReferenceId: value.ReferenceId ?? null,
    };
  }
  return map;
};

/** A staged draft's values keyed for the form. */
export const valueListToMap = (values: RecordValueInput[]): ValueMap => {
  const map: ValueMap = {};
  for (const value of values) map[cellKey(value.SectionKey, value.FieldKey, value.RowKey ?? null)] = value;
  return map;
};
