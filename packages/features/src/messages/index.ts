// @resgrid/features/messages — Responder messages (omni-plan §7.11): inbox/outbox, a message's own page with answers
// (callback/poll Yes/Maybe/No, calendar RSVP), a compose page to everyone/personnel/groups/roles through the outbox
// (offline), multi-select delete. Chat is '@resgrid/features/chat'. Route files re-export the screens, e.g.
//   export { default } from '@resgrid/features/messages/screens/messages';

// Screens
export { default as MessageComposeScreen } from './screens/message-compose';
export { default as MessageDetailScreen, type MessageDetailScreenProps } from './screens/message-detail';
export { default as MessagesScreen } from './screens/messages';

// Components
export { MessagesConfirmSheet, type MessagesConfirmSheetProps } from './components/confirm-sheet';
export { MessageCard, type MessageCardProps } from './components/message-card';
export { MessageDetails, type MessageDetailsProps } from './components/message-details';
export { QueuedMessageRow, type QueuedMessageRowProps } from './components/queued-message-row';

// Pure helpers
export * from './lib/message-format';

// Routes and nav
export { type FeatureNavEntry, messagesNav } from './nav';
export { MESSAGE_ROUTE_PATTERNS, messageRoutes } from './routes';
