import { ProtectedFieldIds, revealedValue } from '@resgrid/auth';
import type { CallListItem } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { htmlToPlainText, Pressable, Text, TypeIcon } from '@resgrid/ui';
import { MapPin, Phone, Timer, TriangleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { readableColors } from '../lib/call-colors';
import { type CallAssignmentContext, isCurrentUserOnCall } from '../lib/call-dispatch';
import { TIME_AGO_KEYS, timeAgo } from '../lib/call-time';
import { DispatchTicker } from './dispatch-ticker';
import { QUEUED_CALL_COLORS, QueuedCallBadge } from './queued-call-badge';

/** compact: dense list/console rows · comfortable: the phone card (Responder) · wall: BigBoard widgets, readable across a room. */
export type CallCardDensity = 'compact' | 'comfortable' | 'wall';

/** Check-in timer summary for the card (Unit/IC timer props). */
export interface CallCardTimerState {
  overdue: number;
  warning: number;
}

export interface CallCardProps {
  call: CallListItem;
  /** The resolved priority colour (department priority or built-in); grey when unknown. */
  priorityColor?: string | null;
  /** Priority name shown on compact rows (already translated). */
  priorityLabel?: string | null;
  density?: CallCardDensity;
  /** Dispatches for the ticker (call extras). */
  dispatches?: readonly DispatchedEventResultData[] | null;
  showDispatchTicker?: boolean;
  /** Outlines the card when the signed-in user (or their unit seat, group or role) is on the call. */
  assignmentContext?: CallAssignmentContext | null;
  timerState?: CallCardTimerState | null;
  /** Epoch ms for "time ago" (defaults to now; injectable for wall boards that tick and for tests). */
  now?: number;
  onPress?: (call: CallListItem) => void;
  testID?: string;
}

const GREY = '#808080';

/**
 * One call as a row or card (omni-plan §7.10: Responder card with dispatch ticker and assignment outline + Unit/IC
 * timer props). `density` lets BigBoard widgets and the Dispatch console reuse it. Nature is shown as plain text
 * (never HTML in a list row); protected values show a "Protected" label, never the REDACTED sentinel.
 */
export const CallCard: React.FC<CallCardProps> = React.memo(function CallCard({
  call,
  priorityColor,
  priorityLabel,
  density = 'comfortable',
  dispatches,
  showDispatchTicker = true,
  assignmentContext,
  timerState,
  now,
  onPress,
  testID,
}) {
  const { t } = useTranslation();
  const rowTestId = testID ?? `call-card-${call.CallId}`;
  const queued = call.queued ?? null;
  const { backgroundColor, textColor } = queued ? { backgroundColor: QUEUED_CALL_COLORS[queued.state].background, textColor: QUEUED_CALL_COLORS[queued.state].text } : readableColors(priorityColor ?? GREY);

  const protectedLabel = t('data_protection.protected_value');
  const name = revealedValue(call.RedactedFields, ProtectedFieldIds.callName, call.Name) ?? protectedLabel;
  const address = revealedValue(call.RedactedFields, ProtectedFieldIds.callAddress, call.Address);
  const natureValue = revealedValue(call.RedactedFields, ProtectedFieldIds.callNature, call.Nature);
  const nature = useMemo(() => (natureValue ? htmlToPlainText(natureValue) : ''), [natureValue]);
  const elapsed = timeAgo(call.LoggedOnUtc, now ?? Date.now());
  const elapsedLabel = elapsed ? t(TIME_AGO_KEYS[elapsed.unit], { count: elapsed.count }) : t('common.unknown');
  const isAssigned = useMemo(() => isCurrentUserOnCall(dispatches ? { Dispatches: [...dispatches] } : null, assignmentContext), [dispatches, assignmentContext]);
  // A queued call has no number yet: it does not exist on the server.
  const numberLabel = queued ? null : call.Number ? `#${call.Number}` : null;
  const timersLabel = timerState && (timerState.overdue > 0 || timerState.warning > 0) ? t('calls.card.timers_attention', { overdue: timerState.overdue, warning: timerState.warning }) : null;
  const a11yLabel = [numberLabel, name, address, queued ? (queued.state === 'rejected' ? t('calls.queued.rejected_badge') : t('calls.queued.badge')) : null, priorityLabel, elapsedLabel]
    .filter((part): part is string => !!part)
    .join(', ');

  const isWall = density === 'wall';
  const isCompact = density === 'compact';
  const showTicker = showDispatchTicker && !isCompact && !queued && !!dispatches && dispatches.length > 0;

  const containerStyle = StyleSheet.flatten([
    isCompact ? styles.compact : isWall ? styles.wall : styles.comfortable,
    isCompact ? { borderLeftColor: queued ? QUEUED_CALL_COLORS[queued.state].border : (priorityColor ?? GREY) } : { backgroundColor },
    queued && !isCompact ? { borderColor: QUEUED_CALL_COLORS[queued.state].border, borderWidth: 2, borderStyle: 'dashed' as const } : null,
    isAssigned && !queued ? styles.assigned : null,
  ]);
  const color = isCompact ? undefined : textColor;

  const content = (
    <View style={containerStyle} testID={rowTestId}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <TypeIcon iconUrl={call.TypeIconUrl} mapIcon={call.TypeMapIcon} size={isWall ? 36 : isCompact ? 18 : 24} fallback={<TriangleAlert size={isWall ? 28 : 18} color={color ?? GREY} />} />
          {numberLabel ? (
            <Text style={StyleSheet.flatten([isWall ? styles.wallNumber : styles.number, color ? { color } : null])} className={color ? undefined : 'text-typography-900'}>
              {numberLabel}
            </Text>
          ) : null}
          {call.CheckInTimersEnabled ? (
            <View style={styles.inlineIcon} accessibilityLabel={t('check_in.tab_title')} testID={`${rowTestId}-timer-icon`}>
              <Timer size={isWall ? 22 : 16} color={timerState && timerState.overdue > 0 ? '#DC2626' : (color ?? GREY)} />
            </View>
          ) : null}
          {isCompact ? (
            <Text style={styles.compactName} className="text-typography-900" numberOfLines={1}>
              {name}
            </Text>
          ) : null}
        </View>
        <Text style={StyleSheet.flatten([isWall ? styles.wallTime : styles.time, color ? { color } : null])} className={color ? undefined : 'text-typography-500'}>
          {elapsedLabel}
        </Text>
      </View>

      {queued ? (
        <View style={styles.badgeRow}>
          <QueuedCallBadge marker={queued} testID={`${rowTestId}-queued`} />
        </View>
      ) : null}

      {isAssigned && !queued ? (
        <View style={styles.assignedBadge} testID={`${rowTestId}-assigned`}>
          <Text style={styles.assignedText}>{t('calls.card.assigned_to_me')}</Text>
        </View>
      ) : null}

      {isCompact ? (
        address ? (
          <Text style={styles.compactAddress} className="text-typography-600" numberOfLines={1}>
            {address}
          </Text>
        ) : null
      ) : (
        <View style={styles.body}>
          <View style={styles.line}>
            <View style={styles.inlineIcon}>
              <Phone size={isWall ? 22 : 16} color={textColor} />
            </View>
            <Text style={StyleSheet.flatten([isWall ? styles.wallName : styles.name, { color: textColor }])} numberOfLines={isWall ? 1 : 2}>
              {name}
            </Text>
          </View>
          {address ? (
            <View style={styles.line}>
              <View style={styles.inlineIcon}>
                <MapPin size={isWall ? 22 : 16} color={textColor} />
              </View>
              <Text style={StyleSheet.flatten([isWall ? styles.wallAddress : styles.address, { color: textColor }])} numberOfLines={isWall ? 1 : 2}>
                {address}
              </Text>
            </View>
          ) : null}
          {showTicker && dispatches ? <DispatchTicker dispatches={dispatches} large={isWall} testID={`${rowTestId}-ticker`} /> : null}
          {timersLabel ? (
            <Text style={StyleSheet.flatten([styles.timers, { color: textColor }])} testID={`${rowTestId}-timers`}>
              {timersLabel}
            </Text>
          ) : null}
          {!isWall && nature ? (
            <View style={styles.nature}>
              <Text style={StyleSheet.flatten([styles.natureText, { color: textColor }])} numberOfLines={3}>
                {nature}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  return onPress ? (
    <Pressable onPress={() => onPress(call)} accessibilityRole="button" accessibilityLabel={a11yLabel} accessibilityHint={t('calls.card.open_hint')}>
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={a11yLabel}>
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  comfortable: { borderRadius: 12, padding: 10, marginBottom: 12 },
  compact: { borderLeftWidth: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4 },
  wall: { borderRadius: 16, padding: 16, marginBottom: 12 },
  assigned: { borderWidth: 3, borderColor: '#FDE047' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  number: { fontSize: 17, fontWeight: '700', marginLeft: 6 },
  wallNumber: { fontSize: 28, fontWeight: '800', marginLeft: 10 },
  time: { fontSize: 13 },
  wallTime: { fontSize: 22, fontWeight: '600' },
  inlineIcon: { marginHorizontal: 4 },
  compactName: { fontSize: 15, fontWeight: '600', marginLeft: 6, flexShrink: 1 },
  compactAddress: { fontSize: 13, marginTop: 2 },
  badgeRow: { marginTop: 6 },
  assignedBadge: { alignSelf: 'flex-start', backgroundColor: '#FDE047', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  assignedText: { fontSize: 11, fontWeight: '700', color: '#422006', textTransform: 'uppercase' },
  body: { marginTop: 8 },
  line: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  wallName: { fontSize: 26, fontWeight: '700', flexShrink: 1 },
  address: { fontSize: 14, flexShrink: 1 },
  wallAddress: { fontSize: 22, flexShrink: 1 },
  timers: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  nature: { marginTop: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.35)', padding: 8 },
  natureText: { fontSize: 14, lineHeight: 20 },
});
