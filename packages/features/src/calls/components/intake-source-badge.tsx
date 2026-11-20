import { useTranslation } from '@resgrid/i18n';
import { type CallResultData, IntakeChannelTypes } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import { Inbox, PhoneIncoming } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { callIntakeSource, intakeSourceLabel } from '../lib/call-source';

/** Fixed colours: the badge sits on priority-coloured call cards as well as on plain rows. */
const BADGE_COLORS = { background: '#E0F2FE', border: '#0369A1', text: '#0C4A6E' } as const;

export interface IntakeSourceBadgeProps {
  call: Pick<CallResultData, 'CallSource' | 'IntakeChannelName' | 'IntakeChannelType'>;
  testID?: string;
}

/**
 * Where a call from an external intake came from (Core M0323): "Via text message: {channel}" (email, WhatsApp, Slack, Teams,
 * Telegram, Discord, Google Chat, webhook, voice line) from the channel's type and name, or the generic "Intake" / "Voice line"
 * when the server names no channel. Nothing for any other call, or from servers that predate `CallSource`.
 */
export const IntakeSourceBadge: React.FC<IntakeSourceBadgeProps> = ({ call, testID = 'intake-source-badge' }) => {
  const { t } = useTranslation();
  const source = callIntakeSource(call);

  if (!source) return null;

  const label = intakeSourceLabel(source);
  const text = t(label.key, label.name ? { name: label.name } : undefined);

  return (
    <View style={styles.badge} accessible accessibilityRole="text" accessibilityLabel={text} testID={testID}>
      <View style={styles.icon}>{source.kind === 'voice' || source.channelType === IntakeChannelTypes.Voice ? <PhoneIncoming size={12} color={BADGE_COLORS.text} /> : <Inbox size={12} color={BADGE_COLORS.text} />}</View>
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
