// The dispatcher desk ("Dispatchers on duty", Dispatch, Core M0324; `capabilities.calls.dispatcherDesk`): routed work
// (pending and scheduled calls, texts, emails, chats, held phone calls), presence (sign in, away, heartbeat), breaks with
// the team's coverage timeline, the offer alert and quiet alerts while on break. Mount `DispatcherDeskHost` once in the
// signed-in shell, register `DeskStatusBar` as a shell banner and call `registerDispatcherDeskSignOut()` once at start.
//
// Re-exported through one statement: Oxlint's readable spacing wants a blank line between top-level statements, which
// the export sorter removes.
import { CoverageTimelineView, type CoverageTimelineViewProps } from './components/coverage-timeline-view';
import { DeskPill, type DeskPillProps } from './components/desk-pill';
import { DeskStatusBar, type DeskStatusBarProps } from './components/desk-status-bar';
import { DispatcherDeskHost } from './components/dispatcher-desk-host';
import { DeskItemDetail, type DeskItemDetailProps } from './components/item-detail';
import { OfferAlert, type OfferAlertProps } from './components/offer-alert';
import { QueueItemRow, type QueueItemRowProps } from './components/queue-item-row';
import { StateChip, type StateChipProps } from './components/state-chip';
import { sortTeam, TeamBoard, type TeamBoardProps } from './components/team-board';
import { type DeskActions, useDeskActions } from './hooks/use-desk-actions';
import { type DeskAlertsState, noteOwnBreakEnd, useDeskAlerts } from './hooks/use-desk-alerts';
import { DESK_FOREGROUND_REFRESH_MS, DESK_HEARTBEAT_MS, type DispatcherDeskView, useDispatcherDeskSync, useDispatcherDeskView, useIsDispatcherDeskEnabled, useNow } from './hooks/use-dispatcher-desk';
import { buildCoverageTimeline, type CoverageTimeline, mergeSlots } from './lib/coverage-timeline';
import { dueBreakAlerts, findNewEscalations, findNewInbound, findNewOffers, isBreakAlert, shouldSuppressDeskAlert } from './lib/desk-alerts';
import { completeOutcomesFor, describeWarning, deskErrorKey, displayStateLabelKey, displayStateTone, formatCountdown, itemTitle, kindLabelKey } from './lib/desk-format';
import { type DeskSheet, openDeskSheet, useDeskUiStore } from './lib/desk-ui-store';
import { dispatcherDeskNav, type FeatureNavEntry } from './nav';
import { registerDispatcherDeskSignOut } from './register';
import { DISPATCHER_DESK_ROUTE_PATTERNS, dispatcherDeskRoutes } from './routes';
import DeskBreaksScreen from './screens/desk-breaks';
import DeskItemScreen from './screens/desk-item';
import DeskItemCallScreen, { callPrefillFromItem } from './screens/desk-item-call';
import DispatcherDeskScreen, { type DispatcherDeskScreenProps } from './screens/dispatcher-desk';

export {
  buildCoverageTimeline,
  callPrefillFromItem,
  completeOutcomesFor,
  type CoverageTimeline,
  CoverageTimelineView,
  type CoverageTimelineViewProps,
  describeWarning,
  DESK_FOREGROUND_REFRESH_MS,
  DESK_HEARTBEAT_MS,
  type DeskActions,
  type DeskAlertsState,
  DeskBreaksScreen,
  deskErrorKey,
  DeskItemCallScreen,
  DeskItemDetail,
  type DeskItemDetailProps,
  DeskItemScreen,
  DeskPill,
  type DeskPillProps,
  type DeskSheet,
  DeskStatusBar,
  type DeskStatusBarProps,
  DISPATCHER_DESK_ROUTE_PATTERNS,
  DispatcherDeskHost,
  dispatcherDeskNav,
  dispatcherDeskRoutes,
  DispatcherDeskScreen,
  type DispatcherDeskScreenProps,
  type DispatcherDeskView,
  displayStateLabelKey,
  displayStateTone,
  dueBreakAlerts,
  type FeatureNavEntry,
  findNewEscalations,
  findNewInbound,
  findNewOffers,
  formatCountdown,
  isBreakAlert,
  itemTitle,
  kindLabelKey,
  mergeSlots,
  noteOwnBreakEnd,
  OfferAlert,
  type OfferAlertProps,
  openDeskSheet,
  QueueItemRow,
  type QueueItemRowProps,
  registerDispatcherDeskSignOut,
  shouldSuppressDeskAlert,
  sortTeam,
  StateChip,
  type StateChipProps,
  TeamBoard,
  type TeamBoardProps,
  useDeskActions,
  useDeskAlerts,
  useDeskUiStore,
  useDispatcherDeskSync,
  useDispatcherDeskView,
  useIsDispatcherDeskEnabled,
  useNow,
};
