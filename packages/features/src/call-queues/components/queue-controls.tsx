import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Input, InputField, Pressable, Text } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { Search, X } from 'lucide-react-native';
import React from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

/** Search box of a queue screen. */
export const QueueSearch: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string; testID: string }> = ({ value, onChange, placeholder, testID }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-1 flex-row items-center rounded-lg border border-outline-200 bg-background-0 px-3">
      <View>
        <Search size={16} color="#9ca3af" />
      </View>
      <Input variant="underlined" size="md" className="flex-1 border-b-0">
        <InputField value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={placeholder} autoCapitalize="none" autoCorrect={false} testID={testID} />
      </Input>
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('call_queues.clear_search')} testID={`${testID}-clear`}>
          <View>
            <X size={16} color="#9ca3af" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
};

/** A row action (Dispatch, Cancel, Dispatch now): its press never also opens the row's call. */
export const QueueActionButton: React.FC<{ label: string; icon: LucideIcon; onPress: () => void; tone?: 'primary' | 'negative'; isBusy?: boolean; accessibilityLabel: string; testID: string }> = ({
  label,
  icon: Icon,
  onPress,
  tone = 'primary',
  isBusy = false,
  accessibilityLabel,
  testID,
}) => (
  <Button
    size="xs"
    action={tone === 'negative' ? 'negative' : 'primary'}
    variant={tone === 'negative' ? 'outline' : 'solid'}
    onPress={(event?: GestureResponderEvent) => {
      event?.stopPropagation?.();
      onPress();
    }}
    isDisabled={isBusy}
    accessibilityLabel={accessibilityLabel}
    className="ml-2"
    testID={testID}
  >
    {isBusy ? (
      <ButtonSpinner />
    ) : (
      <View>
        <Icon size={14} color={tone === 'negative' ? '#dc2626' : '#ffffff'} />
      </View>
    )}
    <ButtonText>{label}</ButtonText>
  </Button>
);

/** A filter chip (archived calls filters). */
export const FilterChip: React.FC<{ label: string; active: boolean; onPress: () => void; color?: string; testID: string }> = ({ label, active, onPress, color, testID }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    className={`mb-2 mr-2 flex-row items-center rounded-full border px-3 py-1 ${active ? 'border-primary-500 bg-primary-500' : 'border-outline-300 bg-background-0'}`}
    testID={testID}
  >
    {color ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: color }])} /> : null}
    <Text className={`text-xs font-semibold ${active ? 'text-typography-0' : 'text-typography-700'}`}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({ dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 } });
