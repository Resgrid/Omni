import { useTranslation } from '@resgrid/i18n';
import { CloudOff } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMapProviderContext } from '../provider/context';
import type { AttributionPosition } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Amber (stale) badge colours per scheme: readable on light and dark maps. */
const STALE_COLORS = {
  light: { background: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  dark: { background: '#451a03', border: '#f59e0b', text: '#fde68a' },
} as const;

/** The badge label: `maps.offline.badge_updated_<unit>` with a count, or `maps.offline.badge` when never updated. */
export function offlineBadgeLabel(updatedAt: number | null, now: number): { key: string; count: number | null } {
  if (updatedAt === null || !Number.isFinite(updatedAt)) return { key: 'maps.offline.badge', count: null };
  const age = Math.max(0, now - updatedAt);
  if (age < MINUTE_MS) return { key: 'maps.offline.badge_updated_now', count: null };
  if (age < HOUR_MS) return { key: 'maps.offline.badge_updated_minutes', count: Math.floor(age / MINUTE_MS) };
  if (age < DAY_MS) return { key: 'maps.offline.badge_updated_hours', count: Math.floor(age / HOUR_MS) };
  return { key: 'maps.offline.badge_updated_days', count: Math.floor(age / DAY_MS) };
}

/** Stale when never updated, or updated longer ago than the manifest's `StaleDays`. */
export const isOfflineMapStale = (updatedAt: number | null, staleAfterMs: number | null, now: number): boolean => updatedAt === null || (staleAfterMs !== null && staleAfterMs > 0 && now - updatedAt > staleAfterMs);

export interface OfflineMapBadgeProps {
  /** False for a map that draws its own style (`mapStyle` / `styleURL`): the provider's offline state is not its own. */
  active?: boolean;
  /** The map's attribution corner; the badge takes the other top corner when that one is used. */
  attributionPosition?: AttributionPosition;
  /** Clock seam (tests). */
  now?: () => number;
}

/**
 * "Offline map · updated 2 d ago" (MapLibre plan §19.8) on every map drawn from local packs; amber past the stale
 * threshold; tap for details (what it is, staleness, attribution). Renders nothing on the online style. Both map
 * renderers mount it inside `MapView`, so no screen has to.
 */
export const OfflineMapBadge: React.FC<OfflineMapBadgeProps> = ({ active = true, attributionPosition, now = Date.now }) => {
  const { t } = useTranslation();
  const { style, offlineUpdatedAt, offlineStaleAfterMs, theme, scheme } = useMapProviderContext();
  const [time, setTime] = useState(now);
  const [expanded, setExpanded] = useState(false);
  const visible = active && style.isOffline;

  useEffect(() => {
    if (!visible) return undefined;
    setTime(now());
    const timer = setInterval(() => setTime(now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [visible, now]);

  if (!visible) return null;

  const label = offlineBadgeLabel(offlineUpdatedAt, time);
  const text = label.count === null ? t(label.key) : t(label.key, { count: label.count });
  const stale = isOfflineMapStale(offlineUpdatedAt, offlineStaleAfterMs, time);
  const palette = stale ? STALE_COLORS[scheme === 'dark' ? 'dark' : 'light'] : { background: theme.overlay, border: theme.overlay, text: theme.onOverlay };
  const corner = attributionPosition === 'top-right' ? styles.topLeft : styles.topRight;

  return (
    <View collapsable={false} pointerEvents="box-none" style={StyleSheet.flatten([styles.wrapper, corner])} testID="offline-map-badge-container">
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ expanded }}
        style={StyleSheet.flatten([styles.badge, { backgroundColor: palette.background, borderColor: palette.border }])}
        testID={stale ? 'offline-map-badge-stale' : 'offline-map-badge'}
      >
        <View style={styles.icon}>
          <CloudOff size={14} color={palette.text} />
        </View>
        <Text style={StyleSheet.flatten([styles.label, { color: palette.text }])} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={StyleSheet.flatten([styles.details, { backgroundColor: theme.background, borderColor: theme.border }])} testID="offline-map-badge-details">
          <Text style={StyleSheet.flatten([styles.detail, { color: theme.text }])}>{t('maps.offline.badge_details')}</Text>
          {stale ? <Text style={StyleSheet.flatten([styles.detail, styles.spaced, { color: theme.text }])}>{t('maps.offline.badge_stale')}</Text> : null}
          {style.attribution ? <Text style={StyleSheet.flatten([styles.detail, styles.spaced, { color: theme.mutedText }])}>{t('maps.offline.badge_attribution', { attribution: style.attribution })}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 8,
    maxWidth: 260,
    zIndex: 20,
  },
  topRight: {
    right: 8,
    alignItems: 'flex-end',
  },
  topLeft: {
    left: 8,
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  details: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  detail: {
    fontSize: 12,
  },
  spaced: {
    marginTop: 4,
  },
});
