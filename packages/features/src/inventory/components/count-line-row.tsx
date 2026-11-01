import { useTranslation } from '@resgrid/i18n';
import type { InventoryCountLine } from '@resgrid/models';
import { HStack, Input, InputField, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { clampQuantity, contentOf, parseQuantityText } from '../lib/count';

export interface CountLineRowProps {
  line: InventoryCountLine;
  /** The counted value (entered here or already on the server); null = not counted yet. */
  value: number | null;
  editable: boolean;
  onChange: (lineId: string, quantity: number) => void;
  /** Touch-target size of the steppers and toggles (MDT: 64). */
  targetSize?: number;
  testID?: string;
}

const Toggle: React.FC<{ label: string; selected: boolean; disabled: boolean; negative?: boolean; onPress: () => void; minHeight: number; testID: string }> = ({
  label,
  selected,
  disabled,
  negative = false,
  onPress,
  minHeight,
  testID,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    testID={testID}
    className={`flex-1 items-center justify-center rounded-lg border px-3 ${selected ? (negative ? 'border-error-600 bg-error-600' : 'border-primary-600 bg-primary-600') : 'border-outline-300 bg-background-0'}`}
    style={StyleSheet.flatten([{ minHeight }, disabled ? styles.disabled : null])}
  >
    <Text className={`font-semibold ${selected ? 'text-typography-0' : 'text-typography-800'}`}>{label}</Text>
  </Pressable>
);

/**
 * One count line (Unit count screen): item, serial/lot, expected quantity, and either Present / Missing for a serialized
 * asset or − / quantity / + / Matches for stock. A line whose count differs from the expectation is outlined.
 */
export const CountLineRow: React.FC<CountLineRowProps> = React.memo(({ line, value, editable, onChange, targetSize = 48, testID }) => {
  const { t } = useTranslation();
  const rowTestId = testID ?? `inventory-line-${line.Id}`;
  const details = contentOf(line.Content);
  const differs = value !== null && value !== line.ExpectedQuantity;
  const [text, setText] = useState(value === null ? '' : String(value));

  // Follow outside changes (steppers, Matches, a server refresh) without fighting what is being typed.
  useEffect(() => {
    setText((current) => (parseQuantityText(current) === value ? current : value === null ? '' : String(value)));
  }, [value]);

  const set = (next: number) => onChange(line.Id, clampQuantity(line, next));
  const meta = [details.SerialNumber, details.LotNumber].filter((part): part is string => !!part).join(' · ');

  return (
    <VStack space="xs" className={`rounded-lg border p-3 ${differs ? 'border-warning-500' : 'border-outline-200'} bg-background-0`} testID={rowTestId}>
      <Text className="font-medium text-typography-900">{details.ItemName || t('inventory.unnamedItem')}</Text>
      {meta ? <Text className="text-sm text-typography-500">{meta}</Text> : null}
      <Text className="text-sm text-typography-500">{t('inventory.expected', { quantity: line.ExpectedQuantity, unit: details.UnitOfMeasure ?? '' })}</Text>
      {line.AssetId ? (
        <HStack space="sm">
          <Toggle label={t('inventory.present')} selected={value === 1} disabled={!editable} onPress={() => set(1)} minHeight={targetSize} testID={`inventory-present-${line.Id}`} />
          <Toggle label={t('inventory.missing')} selected={value === 0} disabled={!editable} negative onPress={() => set(0)} minHeight={targetSize} testID={`inventory-missing-${line.Id}`} />
        </HStack>
      ) : (
        <HStack space="sm" className="items-center">
          <Pressable
            onPress={() => set((value ?? line.ExpectedQuantity) - 1)}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={t('inventory.less')}
            testID={`inventory-less-${line.Id}`}
            className="items-center justify-center rounded-lg border border-outline-300 bg-background-0"
            style={StyleSheet.flatten([{ width: targetSize, height: targetSize }, !editable ? styles.disabled : null])}
          >
            <Minus size={20} color="#2563eb" />
          </Pressable>
          <View style={styles.input}>
            <Input isDisabled={!editable} size="lg">
              <InputField
                value={text}
                placeholder={String(line.ExpectedQuantity)}
                keyboardType="decimal-pad"
                onChangeText={(next) => {
                  setText(next);
                  const parsed = parseQuantityText(next);
                  if (parsed !== null) set(parsed);
                }}
                accessibilityLabel={details.ItemName || t('inventory.unnamedItem')}
                testID={`inventory-quantity-${line.Id}`}
              />
            </Input>
          </View>
          <Pressable
            onPress={() => set((value ?? line.ExpectedQuantity) + 1)}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={t('inventory.more')}
            testID={`inventory-more-${line.Id}`}
            className="items-center justify-center rounded-lg border border-outline-300 bg-background-0"
            style={StyleSheet.flatten([{ width: targetSize, height: targetSize }, !editable ? styles.disabled : null])}
          >
            <Plus size={20} color="#2563eb" />
          </Pressable>
          <Pressable onPress={() => set(line.ExpectedQuantity)} disabled={!editable} accessibilityRole="button" testID={`inventory-matches-${line.Id}`} className="justify-center px-2" style={{ minHeight: targetSize }}>
            <Text className={`font-semibold ${editable ? 'text-primary-600' : 'text-typography-400'}`}>{t('inventory.matches')}</Text>
          </Pressable>
        </HStack>
      )}
    </VStack>
  );
});

CountLineRow.displayName = 'CountLineRow';

const styles = StyleSheet.create({
  input: { width: 96 },
  disabled: { opacity: 0.5 },
});
