import { isRedactedValue } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallDetailStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { LocationHistoryCallData, LocationHistoryMatch } from '@resgrid/models';
import { Button, ButtonText, Loading, Pressable, Text } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface LocationHistoryPanelProps {
  callId: string;
  onOpenCall?: (callId: string) => void;
}

const MATCH_KEYS: Record<LocationHistoryMatch, string> = {
  SameContact: 'location_history.match.same_contact',
  SameAddress: 'location_history.match.same_address',
  SimilarAddress: 'location_history.match.similar_address',
  Nearby: 'location_history.match.nearby',
};

/** Previous calls at this call's location or with the same contacts (R/U location history panel); online read. */
export const LocationHistoryPanel: React.FC<LocationHistoryPanelProps> = ({ callId, onOpenCall }) => {
  const { t } = useTranslation();
  const history = useCallDetailStore((state) => state.details[callId]?.locationHistory);
  const isLoading = useCallDetailStore((state) => state.loading.locationHistory === true);
  const error = useCallDetailStore((state) => state.errors.locationHistory);
  const fetchHistory = useCallDetailStore((state) => state.fetchCallLocationHistory);

  useEffect(() => {
    void fetchHistory(callId);
  }, [callId, fetchHistory]);

  if (isLoading && !history) return <Loading text={t('location_history.loading')} />;
  if (error && !history) {
    return (
      <View style={styles.panel} testID="location-history-panel">
        <Text className="text-error-600">{t('location_history.load_failed')}</Text>
        <Button size="sm" variant="outline" className="mt-2 self-start" onPress={() => void fetchHistory(callId)} accessibilityLabel={t('common.retry')}>
          <ButtonText>{t('common.retry')}</ButtonText>
        </Button>
      </View>
    );
  }
  const calls = (history?.Calls ?? []).filter((call) => call.CallId !== callId);
  return (
    <View style={styles.panel} testID="location-history-panel">
      <Text className="font-semibold text-typography-900" accessibilityRole="header">
        {t('location_history.header_call')}
      </Text>
      <Text size="xs" className="mb-2 text-typography-500">
        {t('location_history.help_call')}
      </Text>
      {history && !history.AddressMatchingAvailable ? (
        <Text size="xs" className="mb-2 text-warning-700">
          {t('location_history.address_matching_off')}
        </Text>
      ) : null}
      {history && !history.IndexComplete ? (
        <Text size="xs" className="mb-2 text-typography-500">
          {t('location_history.index_incomplete')}
        </Text>
      ) : null}
      {calls.length === 0 ? (
        <View>
          <Text className="text-typography-700">{t('location_history.empty')}</Text>
          <Text size="sm" className="text-typography-500">
            {t('location_history.empty_description')}
          </Text>
        </View>
      ) : (
        calls.map((call) => <HistoryRow key={call.CallId} call={call} onOpenCall={onOpenCall} />)
      )}
      {history?.HasMore ? (
        <Text size="xs" className="mt-2 text-typography-500">
          {t('location_history.has_more')}
        </Text>
      ) : null}
    </View>
  );
};

const HistoryRow: React.FC<{ call: LocationHistoryCallData; onOpenCall?: (callId: string) => void }> = ({ call, onOpenCall }) => {
  const { t } = useTranslation();
  const [showNotes, setShowNotes] = useState(false);
  const protectedLabel = t('data_protection.protected_value');
  const title = `#${call.Number} ${isRedactedValue(call.Name) ? protectedLabel : call.Name}`;
  return (
    <View style={styles.row} className="border-outline-100" testID={`location-history-${call.CallId}`}>
      <Pressable onPress={onOpenCall ? () => onOpenCall(call.CallId) : undefined} accessibilityRole={onOpenCall ? 'button' : undefined} accessibilityLabel={title} disabled={!onOpenCall}>
        <Text className="font-semibold text-typography-900">{title}</Text>
        <Text size="xs" className="text-typography-500">
          {[t(`location_history.state.${call.State}`), call.LoggedOn || formatUtcInDepartmentTime(call.LoggedOnUtc, null), call.PriorityText].filter(Boolean).join(' · ')}
        </Text>
        <Text size="xs" className="text-typography-600">
          {[...call.Matches.map((match) => t(MATCH_KEYS[match] ?? 'common.unknown')), call.DistanceMeters ? t('location_history.meters_away', { distance: Math.round(call.DistanceMeters) }) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Pressable>
      {call.Notes.length > 0 ? (
        <Pressable
          onPress={() => setShowNotes((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showNotes }}
          accessibilityLabel={showNotes ? t('location_history.hide_notes') : t('location_history.show_notes', { count: call.Notes.length })}
        >
          <Text size="xs" className="mt-1 text-primary-600">
            {showNotes ? t('location_history.hide_notes') : t('location_history.show_notes', { count: call.Notes.length })}
          </Text>
        </Pressable>
      ) : null}
      {showNotes
        ? call.Notes.map((note) => (
            <Text key={note.CallNoteId} size="xs" className="ml-2 mt-1 text-typography-600">
              {`${note.FullName || t('location_history.unknown_user')}: ${isRedactedValue(note.Note) ? protectedLabel : note.Note}`}
            </Text>
          ))
        : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  row: { borderBottomWidth: 1, paddingVertical: 8 },
});
