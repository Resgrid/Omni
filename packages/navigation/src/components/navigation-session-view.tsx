import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, NativeModal, Text, View, VStack } from '@resgrid/ui';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { DistanceUnits } from '../engine/format';
import { placeIncidents } from '../engine/incidents';
import { useNavigationStore } from '../store/navigation-store';
import { getNavigationServices } from '../store/services';
import { IncidentChips } from './incident-chips';
import { ManeuverBanner } from './maneuver-banner';
import { type NavigationCameraMode, NavigationMap } from './navigation-map';
import { TripBar } from './trip-bar';
import { useNavigationFixes } from './use-navigation-fixes';

export interface NavigationSessionViewProps {
  units: DistanceUnits;
  /** Replayed fixes at this speed (m/s) instead of the device position (QA / screenshots). */
  simulationSpeedMps?: number | null;
  /** Rendered over the map when the session has arrived (status, check-in…). */
  arrivalPanel?: React.ReactNode;
  /** Layers under the route (traffic overlay). */
  underlay?: React.ReactNode;
  /** "Open in…" the crew's navigation app. */
  onOpenExternal?: () => void;
  /** After End: leave the screen. */
  onEnded: () => void;
  testID?: string;
}

const KEEP_AWAKE_TAG = 'resgrid-navigation';

/** Keeps the screen on while guiding (§9.2); a separate component so the hook runs only during a session. */
const KeepAwake: React.FC = () => {
  useKeepAwake(KEEP_AWAKE_TAG);
  return null;
};

/**
 * The navigation screen body (MapLibre plan §9): map with the follow camera, maneuver banner, incidents ahead, trip bar,
 * reroute and "using last route" notices, provider attribution and vehicle-limit note, the first-use safety notice, and the
 * caller's arrival panel. The session itself lives in `useNavigationStore`.
 */
export const NavigationSessionView: React.FC<NavigationSessionViewProps> = ({ units, simulationSpeedMps = null, arrivalPanel, underlay, onOpenExternal, onEnded, testID = 'navigation-session' }) => {
  const { t } = useTranslation();
  const route = useNavigationStore((state) => state.route);
  const progress = useNavigationStore((state) => state.progress);
  const banner = useNavigationStore((state) => state.banner);
  const status = useNavigationStore((state) => state.status);
  const meta = useNavigationStore((state) => state.meta);
  const rerouting = useNavigationStore((state) => state.rerouting);
  const usingLastRoute = useNavigationStore((state) => state.usingLastRoute);
  const muted = useNavigationStore((state) => state.muted);
  const etaAt = useNavigationStore((state) => state.etaAt);
  const legDuration = useNavigationStore((state) => state.legDurationRemaining);
  const legDistance = useNavigationStore((state) => state.legDistanceRemaining);
  const activeLegIndex = useNavigationStore((state) => state.activeLegIndex);
  const [cameraMode, setCameraMode] = useState<NavigationCameraMode>('follow');
  const [noticeOpen, setNoticeOpen] = useState(() => !getNavigationServices().preferences.hasAcknowledgedSafetyNotice());
  const lastFix = useNavigationStore((state) => state.lastFix);
  const placedIncidents = useMemo(() => (route && meta ? placeIncidents(route, meta.incidents) : []), [route, meta]);

  useNavigationFixes({ simulationSpeedMps });

  const end = useCallback(() => {
    useNavigationStore.getState().stop();
    onEnded();
  }, [onEnded]);

  const acknowledge = useCallback(() => {
    getNavigationServices().preferences.acknowledgeSafetyNotice();
    setNoticeOpen(false);
  }, []);

  if (!route) return null;
  const vehicleNote =
    meta?.vehicleRestricted === true
      ? t(meta.vehicleLimitsEnforced === 'all' ? 'navigation.vehicle_limits_all' : meta.vehicleLimitsEnforced === 'size' ? 'navigation.vehicle_limits_size' : 'navigation.vehicle_limits_none')
      : null;

  return (
    <View style={styles.root} testID={testID}>
      <KeepAwake />
      <NavigationMap route={route} progress={progress} fix={lastFix} activeLegIndex={activeLegIndex} cameraMode={cameraMode} onUserMovedMap={() => setCameraMode('free')} underlay={underlay} />
      <View style={styles.top} pointerEvents="box-none">
        {status === 'arrived' ? null : <ManeuverBanner banner={banner} units={units} rerouting={rerouting} />}
        {status === 'arrived' ? null : <IncidentChips placed={placedIncidents} distanceAlong={progress?.distanceAlong ?? 0} units={units} testID={`${testID}-incidents`} />}
        {usingLastRoute ? (
          <View style={styles.notice} testID={`${testID}-last-route`} accessibilityLiveRegion="polite">
            <Text className="font-semibold text-white">{t('navigation.using_last_route')}</Text>
          </View>
        ) : null}
        {simulationSpeedMps !== null ? (
          <View style={styles.simulation} testID={`${testID}-simulation`}>
            <Text className="text-white">{t('navigation.simulation')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.bottom} pointerEvents="box-none">
        {status === 'arrived' && arrivalPanel ? arrivalPanel : null}
        <TripBar
          etaAt={etaAt}
          durationSeconds={legDuration}
          distanceMeters={legDistance}
          units={units}
          isTrafficAware={meta?.isTrafficAware === true}
          muted={muted}
          following={cameraMode === 'follow'}
          onToggleMute={() => useNavigationStore.getState().setMuted(!muted)}
          onOverview={() => setCameraMode('overview')}
          onRecenter={() => setCameraMode('follow')}
          onEnd={end}
          onOpenExternal={onOpenExternal}
        />
        <Text className="mt-1 text-xs text-typography-500" numberOfLines={2} testID={`${testID}-attribution`}>
          {[meta?.attribution, vehicleNote].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' · ')}
        </Text>
      </View>
      <NativeModal visible={noticeOpen} transparent={true} animationType="fade" onRequestClose={acknowledge}>
        <View style={styles.backdrop}>
          <VStack style={styles.dialog} testID={`${testID}-safety-notice`}>
            <Text className="mb-2 text-xl font-bold">{t('navigation.safety_title')}</Text>
            <Text className="mb-4 text-base">{t('navigation.safety_body')}</Text>
            <Button onPress={acknowledge} testID={`${testID}-safety-ok`} style={styles.dialogButton}>
              <ButtonText>{t('navigation.safety_ok')}</ButtonText>
            </Button>
          </VStack>
        </View>
      </NativeModal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { left: 12, position: 'absolute', right: 12, top: 12 },
  bottom: { bottom: 12, left: 12, position: 'absolute', right: 12 },
  notice: { backgroundColor: '#b45309', borderRadius: 10, marginTop: 8, padding: 10 },
  simulation: { alignSelf: 'flex-start', backgroundColor: '#7c3aed', borderRadius: 8, marginTop: 8, paddingHorizontal: 8, paddingVertical: 4 },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#ffffff', borderRadius: 12, maxWidth: 480, padding: 20, width: '100%' },
  dialogButton: { minHeight: 52 },
});
