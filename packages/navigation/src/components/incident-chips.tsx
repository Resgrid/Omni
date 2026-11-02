import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View } from '@resgrid/ui';
import { Ban, CarFront, Construction, Merge, TriangleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { DistanceUnits } from '../engine/format';
import { type IncidentKind, incidentKind, incidentsAhead, type PlacedIncident } from '../engine/incidents';
import { useDistanceText } from './use-distance-text';

export interface IncidentChipsProps {
  /** The route's incidents, placed along it (`placeIncidents`). */
  placed: readonly PlacedIncident[];
  /** Where the vehicle is on the route, metres from its start. */
  distanceAlong: number;
  units: DistanceUnits;
  testID?: string;
}

const ICONS: Record<IncidentKind, typeof TriangleAlert> = {
  accident: TriangleAlert,
  construction: Construction,
  road_closure: Ban,
  congestion: CarFront,
  lane_restriction: Merge,
  other: TriangleAlert,
};

/** Closures and major or critical impacts in red, minor ones in amber, the rest neutral. */
const colorFor = (kind: IncidentKind, closed: boolean, impact: string | null): string => {
  const level = (impact ?? '').toLowerCase();
  if (closed || kind === 'road_closure' || level === 'critical' || level === 'major') return '#b91c1c';
  if (level === 'minor' || kind === 'accident') return '#b45309';
  return '#334155';
};

/**
 * Incidents ahead on the route (MapLibre plan §9.2, `RoutingSupportsIncidents`: accidents, closures, roadworks, heavy
 * traffic as the provider reports them): the next two as chips under the maneuver banner, with the distance to each.
 * Nothing is drawn when the route carries none or they are all behind the vehicle.
 */
export const IncidentChips: React.FC<IncidentChipsProps> = ({ placed, distanceAlong, units, testID = 'navigation-incidents' }) => {
  const { t } = useTranslation();
  const distanceText = useDistanceText(units);
  const ahead = useMemo(() => incidentsAhead(placed, distanceAlong), [placed, distanceAlong]);
  if (ahead.length === 0) return null;
  return (
    <HStack className="mt-2 flex-wrap" testID={testID}>
      {ahead.map((entry, index) => {
        const kind = incidentKind(entry.incident);
        const Icon = ICONS[kind];
        const label = t('navigation.incident_ahead', { type: t(`navigation.incident.${kind}`), distance: distanceText(entry.ahead) });
        return (
          <View
            key={`${index}:${entry.along}`}
            style={StyleSheet.flatten([styles.chip, { backgroundColor: colorFor(kind, entry.incident.Closed, entry.incident.Impact) }])}
            accessibilityLabel={entry.incident.Description ? `${label}. ${entry.incident.Description}` : label}
            testID={`${testID}-${index}`}
          >
            <View style={styles.icon}>
              <Icon size={16} color="#ffffff" />
            </View>
            <Text className="text-sm font-semibold text-white" numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </HStack>
  );
};

const styles = StyleSheet.create({
  chip: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', marginRight: 8, marginTop: 4, paddingHorizontal: 10, paddingVertical: 6 },
  icon: { marginRight: 6 },
});
