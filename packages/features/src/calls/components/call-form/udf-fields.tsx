import { useTranslation } from '@resgrid/i18n';
import type { UdfFieldResultData, UdfFieldValueInput } from '@resgrid/models';
import { Input, InputField, Pressable, Switch, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Server FieldDataType values (Resgrid.Model.UdfFieldDataType). */
export const UDF_FIELD_TYPE = { Text: 0, Number: 1, Decimal: 2, Boolean: 3, Date: 4, DateTime: 5, Dropdown: 6, MultiSelect: 7, Email: 8, Phone: 9, Url: 10, ComboBox: 11 } as const;

export interface UdfOption {
  key: string;
  label: string;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** Options from a field's ValidationRules (`{"Options":[{"Key","Label"}]}` JSON, or a comma list for older data) — Dispatch `parseUdfOptions`. */
export function parseUdfOptions(validationRules: string | null | undefined): UdfOption[] {
  const rules = (validationRules ?? '').trim();
  if (!rules) return [];
  if (rules.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(rules);
      const list = parsed && typeof parsed === 'object' ? ((parsed as { Options?: unknown; options?: unknown }).Options ?? (parsed as { options?: unknown }).options) : null;
      if (!Array.isArray(list)) return [];
      return list.flatMap((raw: unknown) => {
        if (!raw || typeof raw !== 'object') return [];
        const record = raw as Record<string, unknown>;
        const key = asText(record.Key ?? record.key).trim();
        if (!key) return [];
        return [{ key, label: asText(record.Label ?? record.label).trim() || key }];
      });
    } catch {
      return [];
    }
  }
  return rules
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => ({ key: option, label: option }));
}

export interface UdfFieldsProps {
  fields: readonly UdfFieldResultData[];
  values: readonly UdfFieldValueInput[];
  onChange: (values: UdfFieldValueInput[]) => void;
  missingFieldIds?: readonly string[];
}

const KEYBOARD: Partial<Record<number, 'numeric' | 'decimal-pad' | 'email-address' | 'phone-pad' | 'url'>> = {
  [UDF_FIELD_TYPE.Number]: 'numeric',
  [UDF_FIELD_TYPE.Decimal]: 'decimal-pad',
  [UDF_FIELD_TYPE.Email]: 'email-address',
  [UDF_FIELD_TYPE.Phone]: 'phone-pad',
  [UDF_FIELD_TYPE.Url]: 'url',
};

/** The department's custom call fields (Dispatch UDF renderer): text-like inputs, switches and option chips; mobile-visible, enabled fields only. */
export const UdfFields: React.FC<UdfFieldsProps> = ({ fields, values, onChange, missingFieldIds = [] }) => {
  const { t } = useTranslation();
  const visible = [...fields].filter((field) => field.IsEnabled && field.IsVisibleOnMobile).sort((a, b) => a.SortOrder - b.SortOrder);
  const valueOf = (fieldId: string, fallback: string): string => values.find((value) => value.UdfFieldId === fieldId)?.Value ?? fallback;
  const setValue = (fieldId: string, value: string) => onChange([...values.filter((entry) => entry.UdfFieldId !== fieldId), { UdfFieldId: fieldId, Value: value }]);

  if (visible.length === 0) return null;
  return (
    <View testID="udf-fields">
      {visible.map((field) => {
        const value = valueOf(field.UdfFieldId, field.DefaultValue ?? '');
        const label = `${field.Label || field.Name}${field.IsRequired ? ' *' : ''}`;
        const missing = missingFieldIds.includes(field.UdfFieldId);
        const options = parseUdfOptions(field.ValidationRules);
        const isMulti = field.FieldDataType === UDF_FIELD_TYPE.MultiSelect;
        const selected = isMulti
          ? value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [value];
        return (
          <View key={field.UdfFieldId} style={styles.field} testID={`udf-field-${field.UdfFieldId}`}>
            <Text size="sm" className="mb-1 text-typography-700">
              {label}
            </Text>
            {field.FieldDataType === UDF_FIELD_TYPE.Boolean ? (
              <Switch value={value === 'true'} onValueChange={(checked: boolean) => setValue(field.UdfFieldId, checked ? 'true' : 'false')} disabled={field.IsReadOnly} accessibilityLabel={label} />
            ) : (field.FieldDataType === UDF_FIELD_TYPE.Dropdown || isMulti) && options.length > 0 ? (
              <View style={styles.options} accessibilityRole={isMulti ? undefined : 'radiogroup'} accessibilityLabel={label}>
                {options.map((option) => {
                  const isSelected = selected.includes(option.key);
                  return (
                    <Pressable
                      key={option.key}
                      disabled={field.IsReadOnly}
                      onPress={() => setValue(field.UdfFieldId, isMulti ? (isSelected ? selected.filter((key) => key !== option.key) : [...selected, option.key]).join(',') : option.key)}
                      accessibilityRole={isMulti ? 'checkbox' : 'radio'}
                      accessibilityState={isMulti ? { checked: isSelected } : { selected: isSelected }}
                      accessibilityLabel={option.label}
                      className={`mb-2 mr-2 rounded-full border px-3 py-1 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300'}`}
                    >
                      <Text size="sm">{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Input variant="outline" isReadOnly={field.IsReadOnly}>
                <InputField
                  value={value}
                  onChangeText={(text: string) => setValue(field.UdfFieldId, text)}
                  placeholder={field.Placeholder || (field.FieldDataType === UDF_FIELD_TYPE.Date ? 'YYYY-MM-DD' : field.FieldDataType === UDF_FIELD_TYPE.DateTime ? 'YYYY-MM-DD HH:mm' : '')}
                  keyboardType={KEYBOARD[field.FieldDataType] ?? 'default'}
                  autoCapitalize={field.FieldDataType === UDF_FIELD_TYPE.Email || field.FieldDataType === UDF_FIELD_TYPE.Url ? 'none' : 'sentences'}
                  accessibilityLabel={label}
                />
              </Input>
            )}
            {field.Description ? (
              <Text size="xs" className="mt-1 text-typography-500">
                {field.Description}
              </Text>
            ) : null}
            {missing ? (
              <Text size="xs" className="mt-1 text-error-600">
                {t('calls.validation.required')}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap' },
});
