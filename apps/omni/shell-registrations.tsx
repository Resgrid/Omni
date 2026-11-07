// Registers the feature-supplied gate screens, overlays, providers, call-detail tabs and init steps with the app shell.
// The shell never imports features (layering), so this app-layer file is the one place that joins them; every variant
// root layout imports it. Everything here is safe in every variant: features gate themselves on capabilities, modules
// and department flags (a tab or watcher a variant cannot use stays hidden or inert).
import './call-file-reader';

import type { ShellGateScreenProps, SidebarContentProps } from '@resgrid/app-shell';
import { getShellOfflineRuntime, NavMenu, registerInitStep, registerShellBanner, registerShellOverlay, registerShellProvider, registerShellScreens, registerSidebarContent, useShellStore } from '@resgrid/app-shell';
import { getActiveVariant } from '@resgrid/config';
import { configureAppUpdates } from '@resgrid/core';
import { PendingApprovalWatcher } from '@resgrid/features/approve-sign-in';
import { AccessDeniedScreen, LoginScreen, MaintenanceScreen, OnboardingScreen, PersonalLockScreen, RecoveryCodesSheet, SharedDeviceLockScreen } from '@resgrid/features/auth-ui';
import { AwaitingResourcesBanner, AwaitingResourcesHost, awaitingResourcesRoutes, registerAwaitingResourcesCallDetailTab } from '@resgrid/features/awaiting-resources';
import { type LocationPickerProps, registerCallDetailTab, registerCallFormHookPoints, type StaticLocationMapProps } from '@resgrid/features/calls';
import { createDataChecklistRunWriter, registerChecklistRunWriter } from '@resgrid/features/checklists';
import { setDashboardStorage } from '@resgrid/features/dashboard';
import { StepUpPromptHost } from '@resgrid/features/data-protection';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { createIncidentCommandCallTab } from '@resgrid/features/incident-command';
import { registerOfflineMapsSettings } from '@resgrid/features/offline-maps';
import { CALL_RECORDS_TAB, configureRecords, registerRecordsContextHook } from '@resgrid/features/records';
import { registerRunCardCallDetailTab, registerRunCardHookPoints } from '@resgrid/features/runcards';
import { configureSettings } from '@resgrid/features/settings';
import { StatusTimerBanner, StatusTimerNotifications, unitStatusRoutes, UnitStatusSidebar } from '@resgrid/features/unit-status';
import { AudioStreamSheet, VoiceChannelSheet, VoiceMenuButtons } from '@resgrid/features/voice';
import { FullScreenLocationPicker, StaticMap } from '@resgrid/maps';
import { configureNotificationSounds } from '@resgrid/notifications';
import { playAudioClip } from '@resgrid/voice';
import { usePathname } from 'expo-router';

import { appUpdatesModule } from './app-updates';
import { ACTIVE_UNIT_ADAPTER, clearActiveCall, ShellChatIdentityProvider, ShellMapProvider, ShellNavigationHandoffProvider, ShellRouteMapProvider, ShellStatusProvider, storageSyncServices } from './feature-providers';
import { registerMapConfigRefreshStep } from './map-config-refresh';
import { registerNavigationSteps } from './navigation-wiring';
import { NOTIFICATION_SOUNDS } from './notification-sounds';
import { registerOfflineMapsSteps } from './offline-maps-wiring';
import { useCommandRecordsContext } from './records-context';

// The gate wraps the protected route the member opened, so signing in or unlocking just lets it render; the screens'
// own defaults would replace the route with home and drop a deep link.
const noop = () => undefined;

function GateLogin(_props: ShellGateScreenProps) {
  return <LoginScreen onSignedIn={noop} />;
}

function GatePersonalLock(_props: ShellGateScreenProps) {
  return <PersonalLockScreen onUnlocked={noop} />;
}

function GateOnboarding({ onComplete }: ShellGateScreenProps) {
  return <OnboardingScreen onComplete={onComplete ?? noop} />;
}

function GateAccessDenied({ onComplete }: ShellGateScreenProps) {
  return <AccessDeniedScreen onDismiss={onComplete} />;
}

/** The unit's status timer strip under the app bar, except on the status console, which shows the timer card itself. */
function UnitTimerBanner() {
  const pathname = usePathname();

  return <StatusTimerBanner hidden={pathname === unitStatusRoutes.console()} />;
}

/** Unit's landscape sidebar (manifest shell.sidebarContent 'unit-status'): the status console. */
function UnitSidebar({ onNavigate }: SidebarContentProps) {
  return <UnitStatusSidebar onNavigate={onNavigate} onClearActiveCall={clearActiveCall} />;
}

/** Responder's side menu (manifest shell.sidebarContent 'member-menu'): the menu with the voice and stream buttons under the profile. */
function MemberMenu({ nav, onNavigate }: SidebarContentProps) {
  return <NavMenu nav={nav} onNavigate={onNavigate} actions={<VoiceMenuButtons />} />;
}

/** The call form's full-screen map picker (the address of the picked point comes from the server). */
function CallLocationPicker({ isOpen, onClose, initial, onSelect }: LocationPickerProps) {
  return <FullScreenLocationPicker isOpen={isOpen} initialLocation={initial} onClose={onClose} onLocationSelected={onSelect} />;
}

/** The map of a call (detail) or of the location being entered (form). */
function CallStaticMap({ latitude, longitude, address, height, onPress, testID }: StaticLocationMapProps) {
  return <StaticMap latitude={latitude} longitude={longitude} address={address} zoom={15} height={height} showUserLocation onPress={onPress} testID={testID} />;
}

/** The awaiting-resources strip under the app bar, except on the Awaiting Resources screen itself. */
function AwaitingBanner() {
  const pathname = usePathname();

  return <AwaitingResourcesBanner hidden={pathname === awaitingResourcesRoutes.list()} />;
}

registerShellScreens({
  Login: GateLogin,
  Onboarding: GateOnboarding,
  Maintenance: MaintenanceScreen,
  PersonalLock: GatePersonalLock,
  SharedDeviceLock: SharedDeviceLockScreen,
  AccessDenied: GateAccessDenied,
});

registerShellOverlay('recovery-codes', RecoveryCodesSheet);

registerShellOverlay('step-up-prompt', StepUpPromptHost);

// Opens the approve screen when a sign-in request is waiting (inert without capabilities.push.approveSignIns).
registerShellOverlay('pending-approval', PendingApprovalWatcher);

// The voice channels and audio streams sheets, opened through their stores from any button (Unit's sidebar, Responder's menu): mounted
// once here so two can never stack. The voice sheet renders nothing without capabilities.voice.ptt.
registerShellOverlay('voice-channels', VoiceChannelSheet);

registerShellOverlay('audio-streams', AudioStreamSheet);

// Dispatch's awaiting-resources sync and unit-available alerts, and its banner (inert without calls.runCards + flags).
registerShellOverlay('awaiting-resources', AwaitingResourcesHost);

registerShellBanner('awaiting-resources', AwaitingBanner);

// Unit's own status timer strip (inert without the unit-status module and an active unit).
registerShellBanner('unit-status-timer', UnitTimerBanner);

// ...and its notifications while the app is in the background or the screen is off (same gates; iOS and Android).
registerShellOverlay('unit-status-timer-notifications', StatusTimerNotifications);

// Unit's status console in the sidebar (only read where shell.sidebarContent is 'unit-status').
registerSidebarContent('unit-status', UnitSidebar);

// Responder's menu with its voice and stream buttons (only read where shell.sidebarContent is 'member-menu').
registerSidebarContent('member-menu', MemberMenu);

// Around the signed-in frame, outermost first: maps (style, services, offline packs), then the session facts the
// feature sheets read.
registerShellProvider('maps', ShellMapProvider, { order: 10 });

registerShellProvider('navigation-handoff', ShellNavigationHandoffProvider, { order: 20 });

registerShellProvider('status', ShellStatusProvider, { order: 30 });

registerShellProvider('chat-identity', ShellChatIdentityProvider, { order: 40 });

registerShellProvider('unit-routes-map', ShellRouteMapProvider, { order: 50 });

// Call detail tabs from other modules — Records (Records.System + the app's field flag), Incident command (by tier),
// Run card and Awaiting (calls.runCards + Dispatch.RunCards*) — and run-card recommendations in the new-call form.
registerCallDetailTab(CALL_RECORDS_TAB);

registerCallDetailTab(createIncidentCommandCallTab());

registerRunCardCallDetailTab();

registerAwaitingResourcesCallDetailTab();

registerRunCardHookPoints();

// The calls screens never import maps or native audio: the app hands them the map picker, the static map and clip playback.
registerCallFormHookPoints({ LocationPicker: CallLocationPicker, StaticLocationMap: CallStaticMap, playAudioClip });

// Readiness checklist runs save through the data layer's checklists store.
registerChecklistRunWriter(createDataChecklistRunWriter());

// Settings → Offline maps follows the pack manager (shown on iOS/Android when the department offers packs).
registerOfflineMapsSettings();

registerOfflineMapsSteps();

// The department config's signed map URLs (style, static map, offline manifest) are fetched again before they expire.
registerMapConfigRefreshStep();

// In-app turn-by-turn (Unit, `maps.navigationInApp`): routes, prompts, live ETA reports and the navigation location profile.
registerNavigationSteps();

// In-app OTA updates (docs/subsystems/app-updates.md): iOS/Android release builds hand @resgrid/core the expo-updates
// module (app-updates.native.ts); web, Electron and development builds hand over nothing, so updates stay off there. The
// shell's init steps check after sign-in and on foreground; Settings → App updates checks on demand.
configureAppUpdates({ module: appUpdatesModule });

// In-app notification sounds (foreground web/desktop pushes and desktop notices, the Settings sound tests): web and
// Electron load the bundled files, iOS/Android play the copies in the native project (notification-sounds.native.ts).
configureNotificationSounds(NOTIFICATION_SOUNDS);

// Once storage is open, before any screen mounts: Storage & sync (and Unit's unit choice), the Records outbox controls
// and BigBoard's dashboard storage read the offline runtime; a variant that commands incidents authors records against
// the board's call and the member's command role; feature screens (status timers, the dashboard) follow the shell's
// department config.
registerInitStep(
  'startup',
  {
    id: 'startup.features',
    run: () => {
      const runtime = getShellOfflineRuntime();
      const variant = getActiveVariant();
      configureSettings({ storageSync: storageSyncServices(), activeUnit: variant.capabilities.status.subject === 'unit' ? ACTIVE_UNIT_ADAPTER : null });
      configureRecords({ outbox: runtime ? runtime.outbox : null });

      if (variant.capabilities.incidentCommand === 'command') {
        registerRecordsContextHook(useCommandRecordsContext);
      }

      if (variant.modules.includes('dashboard')) {
        // BigBoard kept its layouts and widget settings in react-native-mmkv's default instance.
        setDashboardStorage(runtime && runtime.storage.instances.has('mmkv.default') ? runtime.storage.get('mmkv.default') : (runtime?.storage.main ?? null));
      }

      setDepartmentConfig(useShellStore.getState().departmentConfig);
      useShellStore.subscribe((state, previous) => {
        if (state.departmentConfig !== previous.departmentConfig) {
          setDepartmentConfig(state.departmentConfig);
        }
      });
    },
  },
  { after: 'startup.offline' }
);
