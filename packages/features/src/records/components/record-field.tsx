import { OptionChips } from '@resgrid/features/calls';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type RecordFieldSchema, type RecordValueInput, RmsFieldType } from '@resgrid/models';
import { Badge, BadgeText, DateTimeField, Input, InputField, Text, Textarea, TextareaInput } from '@resgrid/ui';
import { Lock } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { isRestricted, isSupportedField } from '../lib/record-schema';
import { CheckRow } from './records-layout';

// One control from the definition schema. A field type this build cannot draw renders read-only with a plain
// explanation instead of guessing at an editor — the web app remains the escape path.

export interface RecordFieldProps {
  field: RecordFieldSchema;
  value: RecordValueInput | undefined;
  required: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** The server withheld this cell (ADP sealed / restricted): shown as protected, never edited or posted. */
  withheld?: boolean;
  onChange: (next: Partial<RecordValueInput>) => void;
  testID?: string;
}

const keyboardFor = (type: RmsFieldType): 'default' | 'numeric' | 'decimal-pad' => {
  if (type === RmsFieldType.Integer) return 'numeric';
  if (type === RmsFieldType.Decimal || type === RmsFieldType.Currency || type === RmsFieldType.Quantity) return 'decimal-pad';
  return 'default';
};

export const RecordField: React.FC<RecordFieldProps> = ({ field, value, required, disabled = false, invalid = false, withheld = false, onChange, testID }) => {
  const { t } = useTranslation();
  const text = value?.Value ?? '';
  const selected = value?.Values ?? [];
  const setText = useCallback((next: string) => onChange({ Value: next }), [onChange]);
  const options = (field.Options ?? []).filter((option) => !option.IsInactive).map((option) => ({ value: option.Key, label: option.Label }));

  const wrap = (control: React.ReactNode) => (
    <View style={styles.field} testID={testID}>
      <View style={styles.label}>
        <Text size="sm" className="font-medium text-typography-700">
          {field.Label}
        </Text>
        {required ? (
          <Text size="sm" className="ml-1 text-error-600">
            *
          </Text>
        ) : null}
        {isRestricted(field) ? (
          <Badge action="warning" size="sm" className="ml-2">
            <View style={styles.badgeIcon}>
              <Lock size={10} color="#b45309" />
            </View>
            <BadgeText>{t('records.restricted')}</BadgeText>
          </Badge>
        ) : null}
      </View>
      {control}
      {field.Help ? (
        <Text size="xs" className="mt-1 text-typography-500">
          {field.Help}
        </Text>
      ) : null}
      {invalid ? (
        <Text size="xs" className="mt-1 text-error-600" accessibilityRole="alert">
          {t('records.field_required')}
        </Text>
      ) : null}
    </View>
  );

  const notice = (message: string) => (
    <View className="rounded-md border border-outline-200 bg-background-50 p-3">
      <Text size="sm" className="text-typography-600">
        {message}
      </Text>
    </View>
  );

  if (withheld) return wrap(<ProtectedLabel size="sm" testID={testID ? `${testID}-protected` : undefined} />);
  // Fail closed: this build cannot represent the field, so it never pretends to author it.
  if (!isSupportedField(field)) return wrap(notice(t('records.unsupported_field')));

  switch (field.Type) {
    case RmsFieldType.Date:
    case RmsFieldType.DateTime:
      return wrap(<DateTimeField value={text} onChange={setText} label={field.Label} mode={field.Type === RmsFieldType.Date ? 'date' : 'datetime'} disabled={disabled} testID={testID ? `${testID}-picker` : undefined} />);

    case RmsFieldType.LongText:
      return wrap(
        <Textarea isDisabled={disabled} isInvalid={invalid}>
          <TextareaInput value={text} onChangeText={setText} maxLength={field.MaxLength ?? undefined} placeholder={field.Label} accessibilityLabel={field.Label} testID={testID ? `${testID}-input` : undefined} />
        </Textarea>
      );

    case RmsFieldType.Boolean:
      return wrap(<CheckRow label={field.Label} checked={text === 'true'} disabled={disabled} onChange={(checked) => onChange({ Value: checked ? 'true' : 'false' })} testID={testID ? `${testID}-check` : undefined} />);

    case RmsFieldType.SingleSelect:
      return wrap(
        options.length > 0 ? (
          <OptionChips
            options={options}
            selected={text ? [text] : []}
            onToggle={(key) => (disabled ? undefined : setText(key === text ? '' : key))}
            accessibilityLabel={field.Label}
            testID={testID ? `${testID}-options` : undefined}
          />
        ) : (
          notice(t('records.choose'))
        )
      );

    case RmsFieldType.MultiSelect:
      return wrap(
        <OptionChips
          mode="multiple"
          options={options}
          selected={selected}
          onToggle={(key) => (disabled ? undefined : onChange({ Values: selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key] }))}
          accessibilityLabel={field.Label}
          testID={testID ? `${testID}-options` : undefined}
        />
      );

    case RmsFieldType.Attachment:
      // Attachments upload through the record screen's attachment panel, not inline here.
      return wrap(notice(t('records.attachments_hint')));

    case RmsFieldType.Signature:
      return wrap(
        <CheckRow
          label={t('records.sign_statement')}
          checked={text.length > 0}
          disabled={disabled}
          onChange={(checked) => onChange({ Value: checked ? new Date().toISOString() : '' })}
          testID={testID ? `${testID}-check` : undefined}
        />
      );

    case RmsFieldType.Quantity:
      return wrap(
        <View style={styles.row}>
          <Input style={styles.grow} isDisabled={disabled} isInvalid={invalid}>
            <InputField value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={field.Label} accessibilityLabel={field.Label} testID={testID ? `${testID}-input` : undefined} />
          </Input>
          <Input style={styles.unit} isDisabled={disabled}>
            <InputField
              value={value?.UnitCode ?? field.DefaultUnitCode ?? ''}
              onChangeText={(next: string) => onChange({ UnitCode: next })}
              placeholder={t('records.unit_code')}
              accessibilityLabel={t('records.unit_code')}
            />
          </Input>
        </View>
      );

    default:
      return wrap(
        <Input isDisabled={disabled} isInvalid={invalid}>
          <InputField
            value={text}
            onChangeText={setText}
            keyboardType={keyboardFor(field.Type)}
            maxLength={field.MaxLength ?? undefined}
            placeholder={field.Type === RmsFieldType.Currency ? (field.DefaultCurrency ?? field.Label) : field.Label}
            accessibilityLabel={field.Label}
            testID={testID ? `${testID}-input` : undefined}
          />
        </Input>
      );
  }
};

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  badgeIcon: { marginRight: 4 },
  row: { flexDirection: 'row' },
  grow: { flex: 1, marginRight: 8 },
  unit: { width: 96 },
});
