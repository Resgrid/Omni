import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { useChecklistsFlagStatus, useChecklistUnitId, useDueChecklists } from '../hooks/use-checklists';
import { checklistsList } from '../routes';

/** The server pages due checks 50 at a time; a full page reads "50+". */
const PAGE_SIZE = 50;

export interface DueChecksCardProps {
  /** Default: open the checklists screen. */
  onPress?: () => void;
  testID?: string;
}

/**
 * The home screen's "Due checks (N)" entry (Responder member home; reusable by any home). Hidden unless the department
 * has `Checklists.System`. The count is concealed while the app is in the background and re-read on return, so a
 * protected department never leaves it on the task switcher.
 */
export const DueChecksCard: React.FC<DueChecksCardProps> = ({ onPress, testID = 'home-due-checks' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const flagStatus = useChecklistsFlagStatus();
  const unitId = useChecklistUnitId();
  const enabled = flagStatus === 'enabled';
  const { due, reload } = useDueChecklists(enabled, 0, unitId);
  const [concealed, setConcealed] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setConcealed(false);
        void reload();
      } else setConcealed(true);
    });
    return () => subscription.remove();
  }, [reload]);

  if (!enabled) return null;
  const count = concealed || !due ? null : due.Occurrences.length;
  const label = count == null ? t('checklists.labels.DueChecks') : `${t('checklists.labels.DueChecks')} (${count >= PAGE_SIZE ? `${PAGE_SIZE}+` : count})`;

  return (
    <Button variant="outline" onPress={onPress ?? (() => router.push(checklistsList()))} accessibilityLabel={label} testID={testID}>
      <View>
        <ClipboardCheck size={16} color="#2563eb" />
      </View>
      <ButtonText>{label}</ButtonText>
    </Button>
  );
};
