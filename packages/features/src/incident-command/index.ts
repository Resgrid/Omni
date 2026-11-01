// Incident command (omni-plan §7.10, §7.11 IC; IC is canonical). One board for every app, gated by the variant tier
// (`capabilities.incidentCommand`): view (Responder/Unit: the resource's own slice), assist (Dispatch: the board with the
// member's server capabilities), command (IC: everything, offline-first through the outbox). Route files re-export the
// screens, e.g. `export { default } from '@resgrid/features/incident-command/screens/command-board';`.

// Screens
export { default as CallCommandScreen, type CallCommandScreenProps } from './screens/call-command';
export { default as CommandBoardScreen, type CommandBoardScreenProps } from './screens/command-board';
export { default as CommandLogScreen, type CommandLogScreenProps } from './screens/command-log';
export { default as CommandMapScreen, type CommandMapScreenProps } from './screens/command-map';
export { default as IncidentsListScreen, matchesIncidentSearch } from './screens/incidents-list';
export { default as ResourceMapScreen, type ResourceMapScreenProps } from './screens/resource-map';

// Call detail tab (register with the calls feature's tab registry)
export {
  createIncidentCommandCallTab,
  INCIDENT_COMMAND_CALL_TAB_ID,
  INCIDENT_COMMAND_CALL_TAB_ORDER,
  type IncidentCommandCallTabDefinition,
  IncidentCommandTab,
  type IncidentCommandTabProps,
} from './components/incident-command-tab';

// Components
export { AccountabilitySection, type AccountabilitySectionProps } from './components/accountability-section';
export { AI_ASSISTANT_FLAG, CommandBoardView, type CommandBoardViewProps } from './components/command-board-view';
export { CommandHeader, type CommandHeaderProps } from './components/command-header';
export { formatIncidentDuration, IncidentCard, type IncidentCardProps } from './components/incident-card';
export { type ChatChannelLink, type ChatContactLink, IncidentChatSection, type IncidentChatSectionProps } from './components/incident-chat-section';
export { LogSection, type LogSectionProps, sortLogEntries } from './components/log-section';
export { NeedsSection, type NeedsSectionProps } from './components/needs-section';
export { NotesSection, type NotesSectionProps } from './components/notes-section';
export { ObjectivesSection, type ObjectivesSectionProps } from './components/objectives-section';
export { ResourceIncidentPanel, type ResourceIncidentPanelProps } from './components/resource-incident-panel';
export { RolesSection, type RolesSectionProps } from './components/roles-section';
export { StructureBoard, type StructureBoardProps } from './components/structure-board';
export { TimersSection, type TimersSectionProps } from './components/timers-section';
export { VoiceSection, type VoiceSectionProps } from './components/voice-section';
export { WorkTimeLight, type WorkTimeLightProps } from './components/work-time-light';

// Hooks
export { type AssignableResource, type BoardRoster, useBoardRoster } from './hooks/use-board-roster';
export { type CommandActionOutcome, useCommandActions } from './hooks/use-command-actions';
export { useCommandPermissions, useIncidentCommandTier } from './hooks/use-command-permissions';
export { type IncidentChatLinks, useIncidentChat } from './hooks/use-incident-chat';

// Pure helpers
export * from './lib/board';
export * from './lib/events';
export * from './lib/labels';
export * from './lib/map-features';
export { type CommandPermissions, type IncidentCommandTier, NO_COMMAND_PERMISSIONS, resolveCommandPermissions } from './lib/permissions';

// Routes and nav
export { type FeatureNavEntry, incidentCommandNav } from './nav';
export { INCIDENT_COMMAND_ROUTE_PATTERNS, incidentCommandRoutes, type ResourceMapTarget } from './routes';
