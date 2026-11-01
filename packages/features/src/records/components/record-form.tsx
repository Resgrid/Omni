import { useTranslation } from '@resgrid/i18n';
import type { RecordDefinitionSchema, RecordValueInput } from '@resgrid/models';
import { Button, ButtonText, Card, Divider, Heading, Pressable, Text } from '@resgrid/ui';
import { Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cellKey, evaluateRules, isFieldHidden, isFieldRequired, rowKeysFor, type ValidationIssue, type ValueMap } from '../lib/record-schema';
import { RecordField } from './record-field';

// Section-card rendering of one definition version. Rules are evaluated on every change, per row inside repeating
// sections, so what the person sees matches what the server will accept.

export interface RecordFormProps {
  schema: RecordDefinitionSchema;
  values: ValueMap;
  issues?: ValidationIssue[];
  /** Cells the server withheld (protected label, disabled, never posted). */
  withheld?: ReadonlySet<string>;
  readOnly?: boolean;
  forFinalize?: boolean;
  onChange: (values: ValueMap) => void;
}

let rowSequence = 0;
const newRowKey = (): string => {
  rowSequence += 1;
  return `row-${Date.now().toString(36)}-${rowSequence}`;
};

const EMPTY_WITHHELD: ReadonlySet<string> = new Set();

export const RecordForm: React.FC<RecordFormProps> = ({ schema, values, issues, withheld = EMPTY_WITHHELD, readOnly = false, forFinalize = false, onChange }) => {
  const { t } = useTranslation();
  const rules = useMemo(() => evaluateRules(schema, values), [schema, values]);
  const invalidKeys = useMemo(() => new Set((issues ?? []).map((issue) => cellKey(issue.sectionKey, issue.fieldKey, issue.rowKey))), [issues]);

  const setValue = useCallback(
    (sectionKey: string, fieldKey: string, rowKey: string | null, patch: Partial<RecordValueInput>) => {
      const key = cellKey(sectionKey, fieldKey, rowKey);
      const existing = values[key] ?? { SectionKey: sectionKey, FieldKey: fieldKey, RowKey: rowKey };
      onChange({ ...values, [key]: { ...existing, ...patch } });
    },
    [values, onChange]
  );

  const addRow = useCallback(
    (sectionKey: string, fieldKeys: string[]) => {
      const rowKey = newRowKey();
      const ordinal = rowKeysFor(values, sectionKey).length;
      const next: ValueMap = { ...values };
      for (const fieldKey of fieldKeys) next[cellKey(sectionKey, fieldKey, rowKey)] = { SectionKey: sectionKey, FieldKey: fieldKey, RowKey: rowKey, Ordinal: ordinal };
      onChange(next);
    },
    [values, onChange]
  );

  const removeRow = useCallback(
    (sectionKey: string, rowKey: string) => {
      const next: ValueMap = {};
      for (const [key, value] of Object.entries(values)) {
        if (value.SectionKey === sectionKey && value.RowKey === rowKey) continue;
        next[key] = value;
      }
      onChange(next);
    },
    [values, onChange]
  );

  return (
    <View testID="record-form">
      {(schema.Sections ?? []).map((section) => {
        if (rules.hiddenSectionKeys.has(section.Key)) return null;
        const fieldKeys = (section.Fields ?? []).map((field) => field.Key);
        const rowKeys = section.Repeating ? rowKeysFor(values, section.Key) : [];
        const canAddRow = !readOnly && (!section.MaxRows || rowKeys.length < section.MaxRows);

        const renderField = (rowKey: string | null, testID: string) =>
          (section.Fields ?? []).map((field) => {
            if (isFieldHidden(rules, section.Key, field.Key, rowKey)) return null;
            const key = cellKey(section.Key, field.Key, rowKey);
            return (
              <RecordField
                key={`${rowKey ?? 'scalar'}-${field.Key}`}
                field={field}
                value={values[key]}
                required={isFieldRequired(rules, field, section.Key, rowKey, forFinalize)}
                invalid={invalidKeys.has(key)}
                withheld={withheld.has(key)}
                disabled={readOnly}
                onChange={(patch) => setValue(section.Key, field.Key, rowKey, patch)}
                testID={`${testID}-${field.Key}`}
              />
            );
          });

        return (
          <Card key={section.Key} className="mb-3 p-4" testID={`record-section-${section.Key}`}>
            <Heading size="sm" accessibilityRole="header">
              {section.Label}
            </Heading>
            {section.Help ? (
              <Text size="xs" className="text-typography-500">
                {section.Help}
              </Text>
            ) : null}

            {section.Repeating ? (
              <View style={styles.rows}>
                {rowKeys.length === 0 ? (
                  <Text size="sm" className="text-typography-500">
                    {t('records.no_rows')}
                  </Text>
                ) : null}
                {rowKeys.map((rowKey, index) => (
                  <View key={rowKey} className="mb-3 rounded-md border border-outline-200 p-3">
                    <View style={styles.rowHeader}>
                      <Text size="xs" className="font-medium text-typography-500">{`${section.Label} ${index + 1}`}</Text>
                      {!readOnly ? (
                        <Pressable
                          onPress={() => removeRow(section.Key, rowKey)}
                          accessibilityRole="button"
                          accessibilityLabel={t('records.remove_row')}
                          testID={`records-remove-row-${section.Key}-${index}`}
                          className="p-1"
                        >
                          <Trash2 size={16} color="#dc2626" />
                        </Pressable>
                      ) : null}
                    </View>
                    {renderField(rowKey, `records-field-${section.Key}-${index}`)}
                  </View>
                ))}
                {canAddRow ? (
                  <Button variant="outline" size="sm" onPress={() => addRow(section.Key, fieldKeys)} testID={`records-add-row-${section.Key}`}>
                    <Plus size={14} color="#2563eb" />
                    <ButtonText>{t('records.add_row')}</ButtonText>
                  </Button>
                ) : null}
              </View>
            ) : (
              <View style={styles.rows}>
                <Divider className="mb-3" />
                {renderField(null, `records-field-${section.Key}`)}
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  rows: { marginTop: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
});
