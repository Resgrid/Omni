// Registers the feature-supplied gate screens, overlays, providers, call-detail tabs and init steps with the app shell.
// The shell never imports features (layering), so this app-layer file is the one place that joins them; every variant
// root layout imports it. Everything here is safe in every variant: features gate themselves on capabilities, modules
// and department flags (a tab or watcher a variant cannot use stays hidden or inert).
import type { ShellGateScreenProps, SidebarContentProps } from '@resgrid/app-shell';
import { getShellOfflineRuntime, registerInitStep, registerShellBanner, registerShellOverlay, registerShellProvider, registerShellScreens, registerSidebarContent, useShellStore } from '@resgrid/app-shell';
import { getActiveVariant } from '@resgrid/config';
import { PendingApprovalWatcher } from '@resgrid/features/approve-sign-in';
import { AccessDeniedScreen, LoginScreen, MaintenanceScreen, OnboardingScreen, PersonalLockScreen, RecoveryCodesSheet, SharedDeviceLockScreen } from '@resgrid/features/auth-ui';
import { AwaitingResourcesBanner, AwaitingResourcesHost, awaitingResourcesRoutes, registerAwaitingResourcesCallDetailTab } from '@resgrid/features/awaiting-resources';
import { registerCallDetailTab } from '@resgrid/features/calls';
import { createDataChecklistRunWriter, registerChecklistRunWriter } from '@resgrid/features/checklists';
import { setDashboardDepartmentConfig, setDashboardStorage } from '@resgrid/features/dashboard';
import { StepUpPromptHost } from '@resgrid/features/data-protection';
import { createIncidentCommandCallTab } from '@resgrid/features/incident-command';
import { registerOfflineMapsSettings } from '@resgrid/features/offline-maps';
import { CALL_RECORDS_TAB, configureRecords, registerRecordsContextHook } from '@resgrid/features/records';
import { registerRunCardCallDetailTab, registerRunCardHookPoints } from '@resgrid/features/runcards';
import { configureSettings } from '@resgrid/features/settings';
import { UnitStatusSidebar } from '@resgrid/features/unit-status';
import { usePathname } from 'expo-router';

import { ACTIVE_UNIT_ADAPTER, clearActiveCall, ShellChatIdentityProvider, ShellMapProvider, ShellNavigationHandoffProvider, ShellRouteMapProvider, ShellStatusProvider, storageSyncServices } from './feature-providers';
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

/** Unit's landscape sidebar (manifest shell.sidebarContent 'unit-status'): the status console. */
function UnitSidebar(props: SidebarContentProps) {
  return <UnitStatusSidebar {...props} onClearActiveCall={clearActiveCall} />;
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
// Dispatch's awaiting-resources sync and unit-available alerts, and its banner (inert without calls.runCards + flags).
registerShellOverlay('awaiting-resources', AwaitingResourcesHost);
registerShellBanner('awaiting-resources', AwaitingBanner);
// Unit's status console in the sidebar (only read where shell.sidebarContent is 'unit-status').
registerSidebarContent('unit-status', UnitSidebar);

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

// Readiness checklist runs save through the data layer's checklists store.
registerChecklistRunWriter(createDataChecklistRunWriter());

// Settings → Offline maps follows the pack manager (shown on iOS/Android when the department offers packs).
registerOfflineMapsSettings();
registerOfflineMapsSteps();

// Once storage is open, before any screen mounts: Storage & sync (and Unit's unit choice), the Records outbox controls
// and BigBoard's dashboard storage read the offline runtime; a variant that commands incidents authors records against
// the board's call and the member's command role; the dashboard follows the department config.
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
        setDashboardDepartmentConfig(useShellStore.getState().departmentConfig);
        useShellStore.subscribe((state, previous) => {
          if (state.departmentConfig !== previous.departmentConfig) {
            setDashboardDepartmentConfig(state.departmentConfig);
          }
        });
      }
    },
  },
  { after: 'startup.offline' }
);
