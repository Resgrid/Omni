import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, Switch, Text, Textarea, TextareaInput, useToast } from '@resgrid/ui';
import { ShieldAlert } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useHasActiveIncidentCommand } from '../hooks/use-active-incident-command';
import { CLOSE_CALL_TYPES, getCallCloseErrorMessage } from '../lib/close-call';
import { OptionChips } from './option-chips';

export interface CloseCallSheetProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  /** After a successful close (navigate away, refresh a console). */
  onClosed?: () => void;
  /** Overrides the incident-command lookup (tests; IC passes its board state). */
  hasActiveCommand?: boolean;
}

/**
 * Close a call (R + D sheets): close type, optional note, "notify everyone" (on by default). An active incident command
 * blocks closing with an explanation (resgrid-domain; the server refuses it too, and its reason is shown when given).
 * Online write: the call stays open and the sheet stays up on a refusal.
 */
export const CloseCallSheet: React.FC<CloseCallSheetProps> = ({ isOpen, onClose, callId, onClosed, hasActiveCommand }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const closeCall = useCallDetailStore((state) => state.closeCall);
  const fetchCalls = useCallsStore((state) => state.fetchCalls);
  const commandActive = useHasActiveIncidentCommand(callId);
  const blocked = hasActiveCommand ?? commandActive;
  const [closeType, setCloseType] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCloseType(null);
      setNote('');
      setNotify(true);
    }
  }, [isOpen]);

  const submit = async () => {
    if (blocked) return;
    if (closeType === null) {
      toast.error(t('call_detail.close_call_type_required'));
      return;
    }
    setIsSubmitting(true);
    try {
      await closeCall({ callId, type: closeType, note, sendNotification: notify });
      toast.success(t('call_detail.close_call_success'));
      onClose();
      onClosed?.();
      void fetchCalls({ bypassCache: true });
    } catch (error) {
      toast.error(getCallCloseErrorMessage(error) ?? t('call_detail.close_call_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={isSubmitting} snapPoints={[75]} testID="close-call-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {t('call_detail.close_call')}
        </Text>

        {blocked ? (
          <View style={styles.blocked} accessibilityRole="alert" testID="close-call-blocked">
            <View style={styles.blockedIcon}>
              <ShieldAlert size={20} color="#991B1B" />
            </View>
            <View style={styles.blockedBody}>
              <Text className="font-semibold text-error-800">{t('calls.close.blocked_title')}</Text>
              <Text size="sm" className="text-error-700">
                {t('calls.close.blocked_by_command')}
              </Text>
            </View>
          </View>
        ) : null}

        <Text size="sm" className="mb-1 font-medium text-typography-700">
          {t('call_detail.close_call_type')}
        </Text>
        <OptionChips
          options={CLOSE_CALL_TYPES.map((type) => ({ value: type.value, label: t(type.labelKey) }))}
          selected={closeType === null ? [] : [closeType]}
          onToggle={(value) => setCloseType(value)}
          accessibilityLabel={t('call_detail.close_call_type')}
          testID="close-call-type"
        />

        <Text size="sm" className="mb-1 mt-3 font-medium text-typography-700">
          {`${t('call_detail.close_call_note')} (${t('common.optional')})`}
        </Text>
        <Textarea size="md">
          <TextareaInput value={note} onChangeText={setNote} placeholder={t('call_detail.close_call_note_placeholder')} accessibilityLabel={t('call_detail.close_call_note')} testID="close-call-note" />
        </Textarea>

        <View style={styles.notify}>
          <View style={styles.notifyText}>
            <Text className="font-medium text-typography-900">{t('call_detail.close_call_notify')}</Text>
            <Text size="xs" className="text-typography-500">
              {t('call_detail.close_call_notify_hint')}
            </Text>
          </View>
          <Switch value={notify} onValueChange={setNotify} accessibilityLabel={t('call_detail.close_call_notify')} testID="close-call-notify" />
        </View>

        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={isSubmitting} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button
            action="positive"
            className="flex-1"
            onPress={() => void submit()}
            isDisabled={isSubmitting || blocked}
            accessibilityLabel={t('call_detail.close_call')}
            accessibilityState={{ disabled: isSubmitting || blocked }}
            testID="close-call-submit"
          >
            <ButtonText>{isSubmitting ? t('common.submitting') : t('call_detail.close_call')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  blocked: { flexDirection: 'row', borderRadius: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', padding: 10, marginBottom: 12 },
  blockedIcon: { marginRight: 8, marginTop: 2 },
  blockedBody: { flex: 1 },
  notify: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  notifyText: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
});
