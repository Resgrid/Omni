import { useSecurity, useTerm } from '@resgrid/auth';
import { useCapability, useHasModule } from '@resgrid/config';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useNavigationEtaPins } from '@resgrid/features/navigation-eta';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { useCurrentLocation } from '@resgrid/location';
import {
  Camera,
  type CameraRef,
  GeoJsonMapLayer,
  getPinEntityId,
  type MapCameraChangedEvent,
  MapFocusBanner,
  MapLayersButton,
  MapLayersSheet,
  type MapLayerToggleItem,
  MapLegendButton,
  MapLegendSheet,
  MapPins,
  type MapPressEvent,
  MapRecenterButton,
  MapTrafficButton,
  MapView,
  type MapViewRef,
  offlineDepartmentLayerIds,
  OfflineDepartmentLayers,
  TrafficLayer,
  UnitLocationMarker,
  useFollowCamera,
  useMapCenter,
  useMapStyle,
  useMapTheme,
} from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';
import { HStack, Spinner, Text, useFormFactor, useToast } from '@resgrid/ui';
import { type Href, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheck, MapPin as PoiIcon, Phone, Route, Truck, UserRound } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActiveRouteOverlay } from '../components/active-route-overlay';
import { LayerDetailsSheet } from '../components/layer-details-sheet';
import { LayerFeaturePanel, type LayerFeatureSelection } from '../components/layer-feature-details';
import { MapHighlights } from '../components/map-highlights';
import { type MapPinAction, MapPinPanel } from '../components/map-pin-details';
import { useActiveRouteOverlay } from '../hooks/use-active-route-overlay';
import { type DepartmentMapLayer, useDepartmentLayers } from '../hooks/use-department-layers';
import { useLiveMapPins } from '../hooks/use-live-map-pins';
import { useMapLockStore } from '../hooks/use-map-lock';
import { useMapViewStore } from '../hooks/use-map-view-store';
import { TRAFFIC_SURFACES, useTrafficPreference } from '../hooks/use-traffic-preference';
import { eventPhaseAt, eventPhaseLabelKey, firstFeatureDetails, firstOfflineFeatureHit, formatLayerEventDates, hasLayerDetails, type LayerEventPhase } from '../lib/layer-details';
import { departmentTarget, OWN_LOCATION_ZOOM, pinTarget, resolveHomeTarget } from '../lib/map-camera';
import { filterMarkers, findEntityPin, findFocusPin, highlightTargets, markerKindOf, parseMapFocus, poiTypeLayers, presentMarkerKinds, type ToggleableMarkerKind } from '../lib/map-markers';
import { createTapPriority } from '../lib/tap-priority';

/**
 * Links out of the map, built by the app layer from the variant's route contract (`useHref()`): a builder returns null
 * when the variant has no such screen, and the action is not shown — never a dead link.
 */
export interface MapScreenLinks {
  callDetail?: (callId: string) => string | null;
  unitDetail?: (unitId: string) => string | null;
  personnelDetail?: (userId: string) => string | null;
  poiDetail?: (poiId: number) => string | null;
  /** The custom / indoor maps browser and its search (variants with `maps.customIndoor`). */
  customMaps?: () => string | null;
  searchMaps?: () => string | null;
}

export interface MapScreenProps {
  links?: MapScreenLinks;
  /** Subscribe to SignalR pings and live positions (default true; off in tests). */
  realtime?: boolean;
}

const NO_LINKS: MapScreenLinks = {};
const LAYER_ID_PREFIX = 'layer:';
const KIND_ID_PREFIX = 'kind:';
const OFFLINE_LAYERS_ID_PREFIX = 'map-screen-offline-layers';
const PHASE_BADGE_TONE: Record<Exclude<LayerEventPhase, 'none'>, 'primary' | 'outline' | 'muted'> = { active: 'primary', upcoming: 'outline', ended: 'muted' };

/** A link builder's result, or null when it has none or refuses the id (unsafe ids throw in the features' builders). */
const linkOf = <A,>(builder: ((arg: A) => string | null) | undefined, arg: A): string | null => {
  if (!builder) return null;
  try {
    return builder(arg);
  } catch {
    return null;
  }
};

const isPositiveInt = (value: string): boolean => /^[1-9]\d*$/.test(value);

/**
 * The department map (omni-plan §7.10 "Maps", MapLibre through @resgrid/maps; legacy Unit map tab, Responder map panel,
 * Dispatch and BigBoard map screens): calls, units, members (with `CanViewPII`), stations and POIs from the persisted
 * map-markers store, kept live by SignalR pings and the geolocation feed; department layers, the icon legend, pin details
 * with actions and recenter / follow; live traffic (hidden when the server has none; the member's choice is remembered on
 * the device). Style, attribution and offline packs come from the shell's MapProvider.
 *
 * Specialised by capability and form factor, never by app: field devices (`location.transmission`) open on their own
 * position and can make a call the current call; a unit device (`status.subject === 'unit'`) follows the vehicle with
 * the speed-adaptive camera (always, with gestures off, while the crew has locked the map to the unit from the sidebar)
 * and haloes its unit and the crew's call — with the routes module, also its running route
 * (line, remaining numbered stops, check-in radius); wide layouts dock the pin details beside the map.
 * `/map?callId=` (`unitId`, `userId`, `poiId`) frames one pin.
 */
export default function MapScreen({ links = NO_LINKS, realtime = true }: MapScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();
  const formFactor = useFormFactor();
  const { colors: mapColors } = useMapTheme();
  const statusCapability = useCapability('status');
  const locationCapability = useCapability('location');
  const mapsCapability = useCapability('maps');
  const { canUserViewPII } = useSecurity();
  const { activeCallId, activeUnitId, onActiveCallChange } = useStatusContext();
  const handoff = useNavigationHandoff();
  const providerCenter = useMapCenter();
  const { isOffline } = useMapStyle();
  const departmentTimeZone = useDepartmentTimeZone();
  const ownLocation = useCurrentLocation();

  const isUnitDevice = statusCapability.subject === 'unit';
  const isFieldDevice = locationCapability.transmission !== 'none';
  // Unit's "Lock map to unit" (sidebar): the map follows the unit and ignores gestures until the crew unlocks it.
  const isMapLocked = useMapLockStore((state) => state.isMapLocked) && isUnitDevice;
  const docked = formFactor.isDesktop || formFactor.isLandscapeBoard;

  const callsTerm = useTerm('module.calls', t('maps.legend.calls'));
  const unitsTerm = useTerm('module.units', t('maps.legend.units'));
  const personnelTerm = useTerm('module.personnel', t('maps.legend.personnel'));

  const live = useLiveMapPins(realtime);
  const hiddenKinds = useMapViewStore((state) => state.hiddenKinds);
  const hiddenPoiTypes = useMapViewStore((state) => state.hiddenPoiTypes);
  const { layers: departmentLayers, toggleLayer } = useDepartmentLayers(mapsCapability.layers);
  // Offline (§19.2): layers whose GeoJSON was not loaded online draw from the department data bundle. With no layer list
  // on the device the department's on-by-default layers show.
  const offlineLayerIds = useMemo(() => (departmentLayers.length > 0 ? departmentLayers.filter((layer) => layer.isOn).map((layer) => layer.id) : null), [departmentLayers]);
  const onlineLayerIds = useMemo(() => departmentLayers.filter((layer) => layer.isOn && layer.data).map((layer) => layer.id), [departmentLayers]);
  // Unit: the device unit's running route (variants that ship the routes module).
  const hasUnitRoutes = useHasModule('unit-routes');
  const activeRoute = useActiveRouteOverlay(hasUnitRoutes && isUnitDevice, activeUnitId);
  // Live traffic (§11.1): off until the member turns it on; the choice is remembered on this device.
  const [isTrafficOn, toggleTraffic] = useTrafficPreference(TRAFFIC_SURFACES.map.id, TRAFFIC_SURFACES.map.defaultOn);

  // ---- pins, focus, highlights ------------------------------------------------------------------------------------

  // Pins this member may see at all (members only with CanViewPII) — the base for focus and banners, so a link can never
  // surface a person's name — and the subset the layer toggles leave on, which the map draws.
  const permittedPins = useMemo(() => filterMarkers(live.pins, { hiddenKinds: {}, hiddenPoiTypes: {}, canViewPersonnel: canUserViewPII }), [canUserViewPII, live.pins]);
  const visiblePins = useMemo(() => filterMarkers(permittedPins, { hiddenKinds, hiddenPoiTypes, canViewPersonnel: canUserViewPII }), [canUserViewPII, hiddenKinds, hiddenPoiTypes, permittedPins]);
  // What the pin layer draws: navigating units carry their live ETA under their label (selection stays on visiblePins).
  const drawnPins = useNavigationEtaPins(visiblePins);

  const focus = parseMapFocus(params);
  const focusKind = focus?.kind ?? null;
  const focusId = focus?.id ?? null;
  const focusPin = useMemo(() => findFocusPin(permittedPins, focusKind && focusId ? { kind: focusKind, id: focusId } : null), [focusId, focusKind, permittedPins]);
  const activeCallPin = useMemo(() => findEntityPin(permittedPins, 'call', activeCallId), [activeCallId, permittedPins]);
  const highlights = useMemo(() => highlightTargets(visiblePins, { activeCallId, activeUnitId: isUnitDevice ? activeUnitId : null }), [activeCallId, activeUnitId, isUnitDevice, visiblePins]);
  const highlightColors = useMemo(() => ({ activeCall: mapColors.danger, activeUnit: mapColors.primary }), [mapColors.danger, mapColors.primary]);

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  // Looked up in the live list so the details follow position updates and close when the pin goes away (call closed).
  const selectedPin = useMemo(() => (selectedPinId === null ? null : (visiblePins.find((pin) => String(pin.Id) === selectedPinId) ?? null)), [selectedPinId, visiblePins]);
  const markedPinId = selectedPin ? String(selectedPin.Id) : focusPin ? String(focusPin.Id) : activeCallPin ? String(activeCallPin.Id) : null;
  const closePin = useCallback(() => setSelectedPinId(null), []);
  // A tapped layer shape (vendor, stop, zone) with a name or description. One panel at a time: a pin wins over a shape
  // under the same tap (the web map reports both; the native map only the topmost source).
  const [selectedFeature, setSelectedFeature] = useState<LayerFeatureSelection | null>(null);
  const [tapPriority] = useState(createTapPriority);
  const closeFeature = useCallback(() => setSelectedFeature(null), []);

  const handlePinPress = useCallback(
    (pin: MapMakerInfoData) => {
      tapPriority.claimForPin();
      setSelectedFeature(null);
      setSelectedPinId(String(pin.Id));
    },
    [tapPriority]
  );

  const handleFeaturePress = useCallback(
    (layer: DepartmentMapLayer, features: readonly GeoJSON.Feature[]) => {
      const details = firstFeatureDetails(features);

      if (!details) return;
      tapPriority.whenUnclaimed(() => {
        setSelectedPinId(null);
        setSelectedFeature({ ...details, layerName: layer.name });
      });
    },
    [tapPriority]
  );

  // Offline, the layers are drawn from the department data bundle in the offline style's own source, which has no press
  // handler: the map's press looks the tapped feature up in those style layers instead.
  const mapViewRef = useRef<MapViewRef>(null);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      tapPriority.whenUnclaimedAsync(
        async () => firstOfflineFeatureHit((await mapViewRef.current?.queryRenderedFeatures(event.point, { layerIds: offlineDepartmentLayerIds(OFFLINE_LAYERS_ID_PREFIX) })) ?? []),
        (hit) => {
          if (!hit) return;
          const { layerId, layerName, ...details } = hit;

          setSelectedPinId(null);
          setSelectedFeature({ ...details, layerName: departmentLayers.find((layer) => layer.id === layerId)?.name || layerName });
        }
      );
    },
    [departmentLayers, tapPriority]
  );

  // ---- camera -----------------------------------------------------------------------------------------------------

  const cameraRef = useRef<CameraRef>(null);
  const ownPosition = useMemo(() => (ownLocation ? { latitude: ownLocation.latitude, longitude: ownLocation.longitude } : null), [ownLocation]);
  const department = useMemo(
    () => departmentTarget({ centerLatitude: live.centerLatitude, centerLongitude: live.centerLongitude, zoomLevel: live.zoomLevel }, providerCenter),
    [live.centerLatitude, live.centerLongitude, live.zoomLevel, providerCenter]
  );
  const home = resolveHomeTarget({ focusPin, ownLocation: ownPosition, preferOwnLocation: isFieldDevice, department });
  const [initialCamera] = useState(() => home.target);
  const [isFollowing, setIsFollowing] = useState(() => isFieldDevice && focus === null);
  const [hasUserMoved, setHasUserMoved] = useState(false);
  const hasUserMovedRef = useRef(false);
  const followZoomAppliedRef = useRef(false);

  // Unit: the speed-adaptive follow-the-unit camera (navigation tilt), until the crew pans the map (or always, while the
  // map is locked to the unit); quiet while blurred.
  useFollowCamera(
    cameraRef,
    isUnitDevice && ownLocation ? { latitude: ownLocation.latitude, longitude: ownLocation.longitude, heading: ownLocation.heading, speed: ownLocation.speed } : null,
    isUnitDevice && (isFollowing || isMapLocked) && isFocused
  );

  // Locking goes back to following the unit, so unlocking later leaves the map where the lock kept it.
  useEffect(() => {
    if (!isMapLocked) return;
    hasUserMovedRef.current = false;
    setHasUserMoved(false);
    setIsFollowing(true);
  }, [isMapLocked]);

  // Other field devices keep their own position centred (zoomed in once) until the member moves the map.
  const ownLatitude = ownPosition?.latitude ?? null;
  const ownLongitude = ownPosition?.longitude ?? null;
  useEffect(() => {
    if (isUnitDevice || !isFollowing || !isFocused || ownLatitude === null || ownLongitude === null) return;
    const centerCoordinate: [number, number] = [ownLongitude, ownLatitude];
    const firstFrame = !followZoomAppliedRef.current;
    followZoomAppliedRef.current = true;
    cameraRef.current?.setCamera(firstFrame ? { centerCoordinate, zoomLevel: OWN_LOCATION_ZOOM, animationDuration: 800 } : { centerCoordinate, animationDuration: 800 });
  }, [isFocused, isFollowing, isUnitDevice, ownLatitude, ownLongitude]);

  // A new focus (`/map?callId=`) stops following and frames the pin; the camera tracks a moving focused pin until the
  // member pans. The department frame applies when its centre arrives, as long as nothing else drives the camera.
  const focusKey = focus ? `${focus.kind}:${focus.id}` : '';
  useEffect(() => {
    if (!focusKey) return;
    hasUserMovedRef.current = false;
    setHasUserMoved(false);
    setIsFollowing(false);
  }, [focusKey]);

  const homeKey = `${home.reason}|${home.target.centerCoordinate.join(',')}|${home.target.zoomLevel}`;
  useEffect(() => {
    // Own position: the follow camera owns it. Before the first fix a field device frames the department.
    if (hasUserMovedRef.current || !isFocused || (isFollowing && home.reason === 'own-location')) return;
    cameraRef.current?.setCamera({ ...home.target, animationDuration: 600 });
    // homeKey captures home; following/focus changes re-run through their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey]);

  const handleCameraChanged = useCallback((event: MapCameraChangedEvent) => {
    if (!event.isUserInteraction) return;
    hasUserMovedRef.current = true;
    setHasUserMoved(true);
    setIsFollowing(false);
  }, []);

  const recenter = useCallback(() => {
    hasUserMovedRef.current = false;
    setHasUserMoved(false);
    if (home.reason === 'own-location') {
      followZoomAppliedRef.current = false;
      setIsFollowing(true);
    }
    cameraRef.current?.setCamera({ ...home.target, animationDuration: 800 });
  }, [home.reason, home.target]);

  const flyToPin = useCallback((pin: MapMakerInfoData) => {
    const target = pinTarget(pin);
    if (!target) return;
    hasUserMovedRef.current = true;
    setHasUserMoved(true);
    setIsFollowing(false);
    cameraRef.current?.setCamera({ ...target, animationDuration: 800 });
  }, []);

  const showRecenter = !isMapLocked && (hasUserMoved || (home.reason === 'own-location' && !isFollowing));

  // ---- pin details ------------------------------------------------------------------------------------------------

  const kindLabelOf = useCallback(
    (pin: MapMakerInfoData): string => {
      switch (markerKindOf(pin)) {
        case 'call':
          return t('map.kind_call');
        case 'unit':
          return t('map.kind_unit');
        case 'personnel':
          return t('map.kind_personnel');
        case 'station':
          return t('maps.legend.station');
        case 'poi':
          return pin.PoiTypeName?.trim() || t('map.kind_poi');
        case 'hydrant':
          return t('maps.legend.hydrant');
        default:
          return t('map.kind_other');
      }
    },
    [t]
  );

  const openLink = useCallback(
    (href: string) => {
      closePin();
      router.push(href as Href);
    },
    [closePin, router]
  );

  const setCurrentCall = useCallback(
    (callId: string) => {
      if (!onActiveCallChange) return;
      try {
        onActiveCallChange(callId);
        toast.success(t('map.call_set_as_current'));
        closePin();
      } catch {
        toast.error(t('map.failed_to_set_current_call'));
      }
    },
    [closePin, onActiveCallChange, t, toast]
  );

  const directionsTo = useCallback(
    async (pin: MapMakerInfoData) => {
      if (!pinTarget(pin)) {
        toast.error(t('map.no_location_for_routing'));
        return;
      }
      closePin();
      const opened = await handoff.navigateTo({ latitude: pin.Latitude, longitude: pin.Longitude, label: pin.Title });
      if (!opened) toast.error(t('map.failed_to_open_maps'));
    },
    [closePin, handoff, t, toast]
  );

  const pinActions = useMemo<MapPinAction[]>(() => {
    if (!selectedPin) return [];
    const kind = markerKindOf(selectedPin);
    const entityId = getPinEntityId(selectedPin);
    const actions: MapPinAction[] = [];
    const addLink = (id: string, label: string, icon: MapPinAction['icon'], href: string | null) => {
      if (href) actions.push({ id, label, icon, onPress: () => openLink(href) });
    };
    if (kind === 'call') {
      if (isFieldDevice && onActiveCallChange && entityId !== activeCallId) {
        actions.push({ id: 'set-current-call', label: t('map.set_as_current_call'), icon: CircleCheck, primary: true, onPress: () => setCurrentCall(entityId) });
      }
      addLink('view-call', t('map.view_call_details'), Phone, linkOf(links.callDetail, entityId));
    } else if (kind === 'unit') {
      addLink('view-unit', t('map.view_unit_details'), Truck, linkOf(links.unitDetail, entityId));
    } else if (kind === 'personnel') {
      addLink('view-personnel', t('map.view_personnel_details'), UserRound, linkOf(links.personnelDetail, entityId));
    } else if (kind === 'poi' && isPositiveInt(entityId)) {
      addLink('view-poi', t('map.view_poi_details'), PoiIcon, linkOf(links.poiDetail, Number(entityId)));
    }
    actions.push({ id: 'directions', label: t('common.route'), icon: Route, onPress: () => void directionsTo(selectedPin) });
    return actions;
  }, [activeCallId, directionsTo, isFieldDevice, links, onActiveCallChange, openLink, selectedPin, setCurrentCall, t]);

  const pinBadges = useMemo(() => {
    if (!selectedPin) return [];
    const kind = markerKindOf(selectedPin);
    const entityId = getPinEntityId(selectedPin);
    const badges: string[] = [];
    if (kind === 'call' && activeCallId !== null && entityId === activeCallId) badges.push(t('map.current_call'));
    if (kind === 'unit' && isUnitDevice && activeUnitId !== null && entityId === activeUnitId) badges.push(t('map.your_unit'));
    return badges;
  }, [activeCallId, activeUnitId, isUnitDevice, selectedPin, t]);

  // ---- layers sheet and legend ------------------------------------------------------------------------------------

  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  // Mounted on first open (nothing to load while the map starts) and kept so it can animate closed.
  const [isLegendMounted, setIsLegendMounted] = useState(false);
  // Event phases are judged when the sheet opens (a wall board keeps the map open for days).
  const [layersOpenedAt, setLayersOpenedAt] = useState(() => Date.now());
  const [detailsLayerId, setDetailsLayerId] = useState<string | null>(null);
  const detailsLayer = useMemo(() => (detailsLayerId === null ? null : (departmentLayers.find((layer) => layer.id === detailsLayerId) ?? null)), [departmentLayers, detailsLayerId]);

  const openLayers = useCallback(() => {
    setLayersOpenedAt(Date.now());
    setIsLayersOpen(true);
  }, []);

  const showLayerDetails = useCallback((id: string) => {
    if (!id.startsWith(LAYER_ID_PREFIX)) return;
    setLayersOpenedAt(Date.now());
    setIsLayersOpen(false);
    setDetailsLayerId(id.slice(LAYER_ID_PREFIX.length));
  }, []);

  const kinds = useMemo(() => presentMarkerKinds(permittedPins, canUserViewPII), [canUserViewPII, permittedPins]);
  const poiLayers = useMemo(() => poiTypeLayers(permittedPins), [permittedPins]);
  const kindLabels = useMemo<Record<ToggleableMarkerKind, string>>(
    () => ({ call: callsTerm, unit: unitsTerm, personnel: personnelTerm, station: t('map.layer_stations'), poi: t('map.layer_pois'), hydrant: t('map.layer_hydrants') }),
    [callsTerm, personnelTerm, t, unitsTerm]
  );
  const layerItems = useMemo<MapLayerToggleItem[]>(
    () => [
      ...kinds.map((kind) => ({ Id: `${KIND_ID_PREFIX}${kind}`, Name: kindLabels[kind] })),
      ...poiLayers.map((layer) => ({ Id: layer.id, Name: layer.name, Color: layer.color || null })),
      ...departmentLayers.map((layer) => {
        const phase = eventPhaseAt(layer.details?.event, layersOpenedAt);
        const phaseKey = eventPhaseLabelKey(phase);

        return {
          Id: `${LAYER_ID_PREFIX}${layer.id}`,
          Name: layer.name,
          Color: layer.color || null,
          Detail: formatLayerEventDates(layer.details?.event, departmentTimeZone, i18n.language, t) || null,
          Badge: phase !== 'none' && phaseKey ? { label: t(phaseKey), tone: PHASE_BADGE_TONE[phase] } : null,
          HasDetails: hasLayerDetails(layer.details),
        };
      }),
    ],
    [departmentLayers, departmentTimeZone, i18n.language, kindLabels, kinds, layersOpenedAt, poiLayers, t]
  );
  const layerToggles = useMemo<Record<string, boolean>>(() => {
    const toggles: Record<string, boolean> = {};
    for (const kind of kinds) toggles[`${KIND_ID_PREFIX}${kind}`] = hiddenKinds[kind] !== true;
    for (const layer of poiLayers) toggles[layer.id] = hiddenPoiTypes[layer.id] !== true;
    for (const layer of departmentLayers) toggles[`${LAYER_ID_PREFIX}${layer.id}`] = layer.isOn;
    return toggles;
  }, [departmentLayers, hiddenKinds, hiddenPoiTypes, kinds, poiLayers]);
  const handleToggleLayer = useCallback(
    (id: string) => {
      if (id.startsWith(KIND_ID_PREFIX)) {
        useMapViewStore.getState().toggleKind(id.slice(KIND_ID_PREFIX.length) as ToggleableMarkerKind);
      } else if (id.startsWith(LAYER_ID_PREFIX)) {
        toggleLayer(id.slice(LAYER_ID_PREFIX.length));
      } else {
        useMapViewStore.getState().togglePoiType(id);
      }
    },
    [toggleLayer]
  );
  const customMapsHref = mapsCapability.customIndoor ? linkOf(links.customMaps, undefined) : null;
  const searchMapsHref = mapsCapability.customIndoor ? linkOf(links.searchMaps, undefined) : null;
  const browseMaps = useCallback(
    (href: string) => {
      setIsLayersOpen(false);
      router.push(href as Href);
    },
    [router]
  );
  const legendTerms = useMemo(() => ({ calls: callsTerm, units: unitsTerm, personnel: personnelTerm }), [callsTerm, personnelTerm, unitsTerm]);
  const openLegend = useCallback(() => {
    setIsLegendMounted(true);
    setIsLegendOpen(true);
  }, []);

  // ---- banner -----------------------------------------------------------------------------------------------------

  // The focused pin (recenter tracks it again), else on field devices the current call (recenter flies there once).
  const banner = focus
    ? { title: focusPin ? focusPin.Title : t('map.focus_not_found'), detail: focusPin ? kindLabelOf(focusPin) : null, onRecenter: focusPin && !isMapLocked ? recenter : undefined }
    : isFieldDevice && activeCallPin
      ? { title: activeCallPin.Title, detail: t('map.current_call'), onRecenter: isMapLocked ? undefined : () => flyToPin(activeCallPin) }
      : null;

  // Controls move to the left while the docked details cover the right edge.
  const controlSide = docked && (selectedPin || selectedFeature) ? 'left' : 'right';
  const legendOffset = controlSide === 'left' && mapsCapability.layers ? 140 : 80;

  return (
    <View style={styles.container} testID="map-screen">
      <MapView
        ref={mapViewRef}
        style={styles.map}
        compassEnabled
        scrollEnabled={!isMapLocked}
        zoomEnabled={!isMapLocked}
        rotateEnabled={!isMapLocked}
        pitchEnabled={!isMapLocked}
        onCameraChanged={handleCameraChanged}
        onPress={mapsCapability.layers && isOffline ? handleMapPress : undefined}
        testID="map-screen-map"
        unavailableFallback={<MapUnavailable label={t('maps.unavailable')} />}
      >
        <Camera ref={cameraRef} defaultSettings={initialCamera} />
        <TrafficLayer visible={isTrafficOn} idPrefix="map-screen-traffic" />
        {departmentLayers.map((layer) =>
          layer.isOn && layer.data ? (
            <GeoJsonMapLayer key={layer.id} id={`map-layer-${layer.id}`} data={layer.data} color={layer.color} showLabels onFeaturePress={(_feature, features) => handleFeaturePress(layer, features)} />
          ) : null
        )}
        {mapsCapability.layers ? <OfflineDepartmentLayers visibleLayerIds={offlineLayerIds} excludeLayerIds={onlineLayerIds} idPrefix={OFFLINE_LAYERS_ID_PREFIX} /> : null}
        {activeRoute ? <ActiveRouteOverlay route={activeRoute} /> : null}
        <MapHighlights targets={highlights} colors={highlightColors} />
        <MapPins pins={drawnPins} onPinPress={handlePinPress} selectedPinId={markedPinId} canViewPersonnel={canUserViewPII} idPrefix="map-screen-pins" />
        {ownLocation ? (
          <UnitLocationMarker
            latitude={ownLocation.latitude}
            longitude={ownLocation.longitude}
            heading={ownLocation.heading}
            accuracy={ownLocation.accuracy}
            color={mapColors.primary}
            idPrefix="map-screen-own-location"
          />
        ) : null}
      </MapView>

      {banner ? <MapFocusBanner title={banner.title} detail={banner.detail} onRecenter={banner.onRecenter} /> : null}

      {!live.hasLoaded && live.isLoading ? (
        <View style={styles.status} pointerEvents="none" testID="map-screen-loading">
          <HStack space="sm" className="items-center rounded-full bg-background-0 px-3 py-2">
            <Spinner size="small" />
            <Text className="text-sm text-typography-700">{t('map.loading_markers')}</Text>
          </HStack>
        </View>
      ) : null}
      {live.hasError && live.pins.length === 0 ? (
        <View style={styles.status} pointerEvents="none" testID="map-screen-error">
          <Text className="rounded-full bg-background-0 px-3 py-2 text-sm text-typography-700">{t('maps.error_loading')}</Text>
        </View>
      ) : null}

      {mapsCapability.layers ? <MapLayersButton side="left" onPress={openLayers} testID="map-screen-layers-button" /> : null}
      <MapLegendButton side={controlSide} bottomOffset={legendOffset} onPress={openLegend} testID="map-screen-legend-button" />
      <MapTrafficButton isOn={isTrafficOn} side={controlSide} bottomOffset={legendOffset + 60} onPress={toggleTraffic} testID="map-screen-traffic-button" />
      {showRecenter ? <MapRecenterButton side={controlSide} bottomOffset={controlSide === 'left' && mapsCapability.layers ? 80 : 20} onPress={recenter} testID="map-screen-recenter-button" /> : null}

      {selectedPin ? <MapPinPanel isOpen={true} presentation={docked ? 'docked' : 'sheet'} pin={selectedPin} kindLabel={kindLabelOf(selectedPin)} badges={pinBadges} actions={pinActions} onClose={closePin} /> : null}
      {selectedFeature && !selectedPin ? <LayerFeaturePanel isOpen={true} presentation={docked ? 'docked' : 'sheet'} feature={selectedFeature} onClose={closeFeature} /> : null}

      {mapsCapability.layers ? (
        <MapLayersSheet
          isOpen={isLayersOpen}
          onClose={() => setIsLayersOpen(false)}
          layers={layerItems}
          toggles={layerToggles}
          onToggle={handleToggleLayer}
          onShowDetails={showLayerDetails}
          onBrowseMaps={customMapsHref ? () => browseMaps(customMapsHref) : undefined}
          onSearchMaps={searchMapsHref ? () => browseMaps(searchMapsHref) : undefined}
        />
      ) : null}
      {mapsCapability.layers && detailsLayer ? <LayerDetailsSheet isOpen={true} layer={detailsLayer} onClose={() => setDetailsLayerId(null)} now={layersOpenedAt} timeZone={departmentTimeZone} /> : null}
      {isLegendMounted ? <MapLegendSheet isOpen={isLegendOpen} onClose={() => setIsLegendOpen(false)} canViewPersonnel={canUserViewPII} terms={legendTerms} /> : null}
    </View>
  );
}

const MapUnavailable: React.FC<{ label: string }> = ({ label }) => (
  <View style={styles.unavailable} testID="map-screen-unavailable">
    <Text className="text-center text-sm text-typography-500">{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  status: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
