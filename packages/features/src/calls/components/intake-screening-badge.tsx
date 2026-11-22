import { useTranslation } from '@resgrid/i18n';
import { type CallResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import { ShieldAlert } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { intakeScreeningLabelKey } from '../lib/call-source';

/** Fixed amber colours, like the source badge: it sits on priority-coloured cards as well as on plain rows. */
const BADGE_COLORS = { background: '#FEF3C7', border: '#B45309', text: '#78350F' } as const;

export interface IntakeScreeningBadgeProps {
  call: Pick<CallResultData, 'CallSource' | 'IntakeScreening'>;
  testID?: string;
}

/**
 * Why an intake call is flagged (Core M0326): Enhanced AI read it as likely not an incident, the sender is over the hourly limit, or a
 * dispatcher dismissed it as spam. A label only: the call is still a pending call anyone can open, dispatch or close. Nothing for
 * unscreened calls, other calls, or servers that predate the screening.
 */
export const IntakeScreeningBadge: React.FC<IntakeScreeningBadgeProps> = ({ call, testID = 'intake-screening-badge' }) => {
  const { t } = useTranslation();
  const key = intakeScreeningLabelKey(call);

  if (!key) return null;

  const text = t(key);

  return (
    <View style={styles.badge} accessible accessibilityRole="text" accessibilityLabel={text} testID={testID}>
      <View style={styles.icon}>
        <ShieldAlert size={12} color={BADGE_COLORS.text} />
      </View>
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BADGE_COLORS.border,
    backgroundColor: BADGE_COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  icon: { marginRight: 4 },
  text: { fontSize: 12, fontWeight: '600', color: BADGE_COLORS.text, flexShrink: 1 },
});
