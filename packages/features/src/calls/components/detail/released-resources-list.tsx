import type { ReleaseResourceKind } from '@resgrid/api';
import { TermKeys, useTerm } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Text, TypeIcon } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { RELEASE_TEXT_KEYS } from '../../lib/call-release';

export interface ReleasedResourcesListProps {
  /** `CallExtraData.ReleasedUnits` (`getReleasedUnits`). */
  releasedUnits: readonly DispatchedEventResultData[];
  /** `CallExtraData.ReleasedPersonnel` (`getReleasedPersonnel`). */
  releasedPersonnel: readonly DispatchedEventResultData[];
  testID?: string;
}

/**
 * The units and people released (stood down) from a call that stays open, apart from its dispatches and muted: each with
 * when it was released, in the department's time, and by whom. Renders nothing while nobody was released.
 */
export const ReleasedResourcesList: React.FC<ReleasedResourcesListProps> = ({ releasedUnits, releasedPersonnel, testID = 'call-released' }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const unitsTerm = useTerm(TermKeys.Units, t('units.title'));
  const personnelTerm = useTerm(TermKeys.Personnel, t('personnel.title'));

  if (releasedUnits.length === 0 && releasedPersonnel.length === 0) return null;

  const releasedText = (entry: DispatchedEventResultData, kind: ReleaseResourceKind): string => {
    const keys = RELEASE_TEXT_KEYS[kind];
    const time = formatUtcInDepartmentTime(entry.ReleasedOn, timeZone);

    if (!time) return t(keys.released);

    return entry.ReleasedBy ? t(keys.releasedOnBy, { time, name: entry.ReleasedBy }) : t(keys.releasedOn, { time });
  };

  const section = (kind: ReleaseResourceKind, title: string, entries: readonly DispatchedEventResultData[]) =>
    entries.length === 0 ? null : (
      <View style={styles.section} testID={`${testID}-${kind}`}>
        <Text size="xs" className="mb-1 font-semibold uppercase text-typography-500">
          {title}
        </Text>
        {entries.map((entry, index) => (
          <View key={`${entry.Id || entry.Name}-${index}`} style={styles.row} className="border border-dashed border-outline-200" testID={`${testID}-${kind}-${entry.Id || index}`}>
            {kind === 'unit' ? (
              <View style={styles.icon}>
                <TypeIcon iconUrl={entry.TypeIconUrl} mapIcon={entry.TypeMapIcon} size={20} />
              </View>
            ) : null}
            <View style={styles.body}>
              <Text className="font-semibold text-typography-500">{entry.Name}</Text>
              <Text size="xs" className="italic text-typography-500" testID={`${testID}-${kind}-${entry.Id || index}-time`}>
                {releasedText(entry, kind)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );

  return (
    <View style={styles.list} testID={testID}>
      <Text className="mb-2 font-semibold text-typography-600" accessibilityRole="header">
        {t('calls.release.released_heading')}
      </Text>
      {section('unit', unitsTerm, releasedUnits)}
      {section('personnel', personnelTerm, releasedPersonnel)}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { marginTop: 8 },
  section: { marginBottom: 8 },
  // Muted: a released resource is history on this call, not someone working it.
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 10, marginBottom: 8, opacity: 0.7 },
  icon: { marginRight: 8 },
  body: { flex: 1 },
});
