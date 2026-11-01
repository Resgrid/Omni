import { useTranslation } from '@resgrid/i18n';
import type { CalOesMarsQueueItem, CalOesMarsValidation } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface MarsPanelProps {
  items: CalOesMarsQueueItem[];
  validation: CalOesMarsValidation | null;
  canDraft: boolean;
  busy: boolean;
  onDraft: () => void;
  onValidate: (workItemId: string) => void;
}

/**
 * CAL OES MARS from the field: draft the F-42 from the deployment's time reports and run the portal validation.
 * Submission itself stays a manual, audited hand-off on the web.
 */
export const MarsPanel: React.FC<MarsPanelProps> = ({ items, validation, canDraft, busy, onDraft, onValidate }) => {
  const { t } = useTranslation();
  return (
    <View testID="operations-mars">
      {items.length === 0 ? <Text className="text-typography-500">{t('operations.mars.none')}</Text> : null}
      {items.map((item) => (
        <View key={item.Id} className="mb-3 rounded-lg border border-outline-200 p-3" testID={`operations-mars-item-${item.Id}`}>
          <View style={styles.row}>
            <Text className="flex-1 font-semibold text-typography-900">{item.RecordTypeName ?? t('operations.mars.f42')}</Text>
            <Text className="text-typography-500">{item.LocalStateName ?? String(item.LocalState)}</Text>
          </View>
          {item.MarsRecordId ? <Text className="text-typography-500">{t('operations.mars.record', { id: item.MarsRecordId, status: item.ObservedExternalStatus ?? '—' })}</Text> : null}
          <Text className="text-typography-500">{t('operations.mars.counts', { errors: item.ErrorCount, warnings: item.WarningCount })}</Text>
          <Button variant="outline" size="sm" className="mt-2 self-start" onPress={() => onValidate(item.Id)} isDisabled={busy} testID={`operations-mars-validate-${item.Id}`}>
            <ButtonText>{t('operations.mars.validate')}</ButtonText>
          </Button>
          {validation?.WorkItemId === item.Id ? (
            <View className="mt-2" testID={`operations-mars-validation-${item.Id}`}>
              <Text className={validation.IsReadyForPortal ? 'text-success-600' : 'text-error-600'}>{validation.IsReadyForPortal ? t('operations.mars.ready') : t('operations.mars.notReady')}</Text>
              {validation.Errors.map((issue, i) => (
                <Text key={`e-${i}`} size="sm" accessibilityRole="alert" className="text-error-600">
                  {issue.Box ? `${issue.Box}: ${issue.Detail ?? issue.Code}` : (issue.Detail ?? issue.Code)}
                </Text>
              ))}
              {validation.Warnings.map((issue, i) => (
                <Text key={`w-${i}`} size="sm" className="text-warning-600">
                  {issue.Box ? `${issue.Box}: ${issue.Detail ?? issue.Code}` : (issue.Detail ?? issue.Code)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {canDraft ? (
        <Button onPress={onDraft} isDisabled={busy} testID="operations-mars-draft">
          <ButtonText>{t('operations.mars.draft')}</ButtonText>
        </Button>
      ) : null}
      <Text size="xs" className="mt-2 text-typography-500">
        {t('operations.mars.help')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
