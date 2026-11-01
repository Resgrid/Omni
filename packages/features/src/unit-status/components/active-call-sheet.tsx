import { ProtectedFieldIds, revealedValue } from '@resgrid/auth';
import { selectActiveCalls, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';

export interface ActiveCallSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeCallId: string | null;
  onSelect: (callId: string) => void;
  /** Console touch-target size. */
  rowMinHeight?: number;
  testID?: string;
}

/**
 * Picks the crew's active call from the open calls (Unit `call-sidebar` sheet). The list reads the persisted calls store
 * (works offline) and refreshes on open; a failed refresh says so instead of looking like "no open calls".
 */
export const ActiveCallSheet: React.FC<ActiveCallSheetProps> = ({ isOpen, onClose, activeCallId, onSelect, rowMinHeight = 56, testID = 'active-call-sheet' }) => {
  const { t } = useTranslation();
  const allCalls = useCallsStore((state) => state.calls);
  const calls = useMemo(() => selectActiveCalls({ calls: allCalls }), [allCalls]);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const hasError = useCallsStore((state) => !!state.errors.calls);

  useEffect(() => {
    if (isOpen) void useCallsStore.getState().fetchCalls({ bypassCache: true });
  }, [isOpen]);

  const protectedLabel = t('data_protection.protected_value');
  const rows = useMemo(() => calls.map((call) => ({ call, name: revealedValue(call.RedactedFields, ProtectedFieldIds.callName, call.Name) ?? protectedLabel })), [calls, protectedLabel]);

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={calls.length === 0 ? isLoading : false} loadingText={t('common.loading')} snapPoints={[60]} testID={testID}>
      <Text className="text-lg font-bold text-typography-900">{t('calls.select_active_call')}</Text>
      {hasError ? (
        <VStack space="sm" className="items-center py-2" testID={`${testID}-error`}>
          <Text className="text-center text-error-600">{t('calls.errors.load_failed')}</Text>
          <Button variant="outline" size="sm" onPress={() => void useCallsStore.getState().fetchCalls({ bypassCache: true })} testID={`${testID}-retry`}>
            <ButtonText>{t('common.retry')}</ButtonText>
          </Button>
        </VStack>
      ) : null}
      {rows.length === 0 && !isLoading ? (
        <Text className="py-6 text-center text-typography-500" testID={`${testID}-empty`}>
          {t('calls.no_open_calls')}
        </Text>
      ) : null}
      {rows.map(({ call, name }) => {
        const selected = call.CallId === activeCallId;
        return (
          <Pressable
            key={call.CallId}
            onPress={() => onSelect(call.CallId)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`${testID}-call-${call.CallId}`}
            className={`rounded-lg border p-3 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
            style={{ minHeight: rowMinHeight }}
          >
            <HStack space="md" className="items-center">
              <VStack className="flex-1">
                <Text className="font-semibold text-typography-900" numberOfLines={1}>
                  {call.Number ? `#${call.Number} · ${name}` : name}
                </Text>
                {call.Type ? <Text className="text-sm text-typography-500">{call.Type}</Text> : null}
              </VStack>
              {selected ? (
                <View>
                  <Check size={20} color="#2563eb" />
                </View>
              ) : null}
            </HStack>
          </Pressable>
        );
      })}
    </CustomBottomSheet>
  );
};
