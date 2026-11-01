import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, Input, InputField, Pressable, Switch, Text, View, VStack } from '@resgrid/ui';
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react-native';
import React, { type ReactNode, useEffect, useMemo, useState } from 'react';

export const SettingsSection: React.FC<{ title: string; description?: string; children: ReactNode; testID?: string }> = ({ title, description, children, testID }) => (
  <VStack space="sm" className="rounded-xl border border-outline-100 bg-background-0 p-4" testID={testID}>
    <Text className="text-base font-semibold text-typography-900" accessibilityRole="header">
      {title}
    </Text>
    {description ? <Text className="text-xs text-typography-500">{description}</Text> : null}
    {children}
  </VStack>
);

export interface SettingSwitchProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}

export const SettingSwitch: React.FC<SettingSwitchProps> = ({ label, value, onChange, testID }) => (
  <HStack className="min-h-10 items-center justify-between" space="md">
    <Text className="flex-1 text-sm text-typography-800">{label}</Text>
    <Switch value={value} onValueChange={onChange} testID={testID} accessibilityLabel={label} />
  </HStack>
);

export interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  testID: string;
  /** Display of the value (units, "Off"…). */
  format?: (value: number) => string;
}

/** − value + : keyboard- and screen-reader-friendly on every platform (sliders are not, on web and Electron). */
export const NumberStepper: React.FC<NumberStepperProps> = ({ label, value, min, max, step = 1, onChange, testID, format }) => {
  const { t } = useTranslation();
  const clamp = (next: number): number => Math.min(max, Math.max(min, next));
  const display = format ? format(value) : String(value);
  return (
    <HStack className="min-h-10 items-center justify-between" space="md">
      <Text className="flex-1 text-sm text-typography-800">{label}</Text>
      <HStack className="items-center" space="sm">
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          disabled={value <= min}
          className={value <= min ? 'rounded border border-outline-200 p-2 opacity-40' : 'rounded border border-outline-300 p-2'}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.decrease', { name: label })}
          testID={`${testID}-decrease`}
        >
          <Minus size={14} color="#6b7280" />
        </Pressable>
        <Text className="min-w-12 text-center text-sm font-semibold text-typography-900" testID={`${testID}-value`} accessibilityLabel={`${label}: ${display}`}>
          {display}
        </Text>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          disabled={value >= max}
          className={value >= max ? 'rounded border border-outline-200 p-2 opacity-40' : 'rounded border border-outline-300 p-2'}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.increase', { name: label })}
          testID={`${testID}-increase`}
        >
          <Plus size={14} color="#6b7280" />
        </Pressable>
      </HStack>
    </HStack>
  );
};

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedChoiceProps<T extends string> {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}

export function SegmentedChoice<T extends string>({ label, options, value, onChange, testID }: SegmentedChoiceProps<T>) {
  return (
    <VStack space="xs">
      <Text className="text-sm text-typography-800">{label}</Text>
      <HStack space="sm" className="flex-wrap">
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={option.value === value ? 'solid' : 'outline'}
            onPress={() => onChange(option.value)}
            accessibilityState={{ selected: option.value === value }}
            testID={`${testID}-${option.value}`}
          >
            <ButtonText>{option.label}</ButtonText>
          </Button>
        ))}
      </HStack>
    </VStack>
  );
}

export interface CoordinateInputProps {
  label: string;
  value: number;
  /** ±90 for latitude, ±180 for longitude. */
  limit: number;
  onChange: (value: number) => void;
  testID: string;
}

/** A coordinate field that commits on blur/submit and rejects values out of range (an empty field means 0 = default). */
export const CoordinateInput: React.FC<CoordinateInputProps> = ({ label, value, limit, onChange, testID }) => {
  const [text, setText] = useState(value === 0 ? '' : String(value));
  useEffect(() => setText(value === 0 ? '' : String(value)), [value]);
  const commit = (): void => {
    const trimmed = text.trim().replace(',', '.');
    if (!trimmed) return onChange(0);
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && Math.abs(parsed) <= limit) onChange(parsed);
    else setText(value === 0 ? '' : String(value));
  };
  return (
    <VStack space="xs">
      <Text className="text-sm text-typography-800">{label}</Text>
      <Input size="md" variant="outline">
        <InputField value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} keyboardType="numbers-and-punctuation" accessibilityLabel={label} testID={testID} />
      </Input>
    </VStack>
  );
};

export interface TextSettingProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testID: string;
}

/** A text field that commits on blur/submit. */
export const TextSetting: React.FC<TextSettingProps> = ({ label, value, onChange, placeholder, testID }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <VStack space="xs">
      <Text className="text-sm text-typography-800">{label}</Text>
      <Input size="md" variant="outline">
        <InputField value={text} onChangeText={setText} onBlur={() => onChange(text)} onSubmitEditing={() => onChange(text)} placeholder={placeholder} accessibilityLabel={label} testID={testID} />
      </Input>
    </VStack>
  );
};

export interface ColumnOrderEditorProps<K extends string> {
  order: readonly K[];
  labelOf: (key: K) => string;
  onChange: (order: K[]) => void;
  testID: string;
}

/** Up/down arrows per column (BigBoard's column order editor). */
export function ColumnOrderEditor<K extends string>({ order, labelOf, onChange, testID }: ColumnOrderEditorProps<K>) {
  const { t } = useTranslation();
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target] as K, next[index] as K];
    onChange(next);
  };
  return (
    <VStack space="xs" testID={testID}>
      {order.map((key, index) => (
        <HStack key={key} className="items-center justify-between" space="sm">
          <Text className="flex-1 text-sm text-typography-800">{labelOf(key)}</Text>
          <Pressable
            onPress={() => move(index, -1)}
            disabled={index === 0}
            className={index === 0 ? 'rounded border border-outline-200 p-1.5 opacity-40' : 'rounded border border-outline-300 p-1.5'}
            accessibilityRole="button"
            accessibilityLabel={t('configure.move_column_up', { columnName: labelOf(key) })}
            testID={`${testID}-${key}-up`}
          >
            <ChevronUp size={14} color="#6b7280" />
          </Pressable>
          <Pressable
            onPress={() => move(index, 1)}
            disabled={index === order.length - 1}
            className={index === order.length - 1 ? 'rounded border border-outline-200 p-1.5 opacity-40' : 'rounded border border-outline-300 p-1.5'}
            accessibilityRole="button"
            accessibilityLabel={t('configure.move_column_down', { columnName: labelOf(key) })}
            testID={`${testID}-${key}-down`}
          >
            <ChevronDown size={14} color="#6b7280" />
          </Pressable>
        </HStack>
      ))}
    </VStack>
  );
}

export interface MultiSelectOption {
  id: string;
  label: string;
}

export interface EntityMultiSelectProps {
  label: string;
  options: readonly MultiSelectOption[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  testID: string;
}

/** Above this many options a search is needed before the list renders (a 400-person roster never renders at once). */
const MAX_INLINE_OPTIONS = 30;

/** Chips to pick groups, units, people or roles (BigBoard's scheduled-calls filter picker). */
export const EntityMultiSelect: React.FC<EntityMultiSelectProps> = ({ label, options, selectedIds, onChange, testID }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (needle) return options.filter((option) => option.label.toLowerCase().includes(needle) || selectedIds.includes(option.id));
    return options.length <= MAX_INLINE_OPTIONS ? options : options.filter((option) => selectedIds.includes(option.id));
  }, [needle, options, selectedIds]);
  const toggle = (id: string): void => onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);

  return (
    <VStack space="xs" testID={testID}>
      <HStack className="items-center justify-between">
        <Text className="text-sm font-medium text-typography-800">{label}</Text>
        {selectedIds.length > 0 ? (
          <Pressable onPress={() => onChange([])} hitSlop={8} accessibilityRole="button" testID={`${testID}-clear`}>
            <Text className="text-xs font-medium text-primary-600">{t('configure.filter_clear', { count: selectedIds.length })}</Text>
          </Pressable>
        ) : null}
      </HStack>
      {options.length === 0 ? (
        <Text className="text-xs text-typography-400">{t('configure.filter_none')}</Text>
      ) : (
        <>
          {options.length > 8 ? (
            <Input size="sm" variant="outline">
              <InputField
                value={query}
                onChangeText={setQuery}
                placeholder={t('configure.filter_search')}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={`${label} ${t('configure.filter_search')}`}
                testID={`${testID}-search`}
              />
            </Input>
          ) : null}
          {!needle && options.length > MAX_INLINE_OPTIONS ? <Text className="text-xs text-typography-400">{t('configure.filter_search_hint', { count: options.length })}</Text> : null}
          <View className="flex-row flex-wrap">
            {visible.map((option) => {
              const selected = selectedIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  onPress={() => toggle(option.id)}
                  className={selected ? 'mb-1.5 mr-1.5 rounded-full border border-primary-500 bg-primary-500 px-3 py-1' : 'mb-1.5 mr-1.5 rounded-full border border-outline-300 bg-background-0 px-3 py-1'}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  testID={`${testID}-option-${option.id}`}
                >
                  <Text className={selected ? 'text-xs font-medium text-typography-0' : 'text-xs text-typography-800'}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </VStack>
  );
};
