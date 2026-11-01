// @resgrid/features/contacts — contact list and detail (U/I + R + D files/pre-plan), tap-to-act fields, navigation hand-off.
export { ContactCard, type ContactCardProps } from './components/contact-card';
export { ContactField, type ContactFieldAction, type ContactFieldProps } from './components/contact-field';
export { ContactFilesPanel, formatFileSize } from './components/contact-files-panel';
export { ContactNotesList, isContactNoteExpired } from './components/contact-notes-list';
export { ContactPreplanPanel } from './components/contact-preplan-panel';
export * from './lib/contact-format';
export { contactsNav, type FeatureNavEntry } from './nav';
export { defaultNavigationUrl, type NavigationHandoff, NavigationHandoffProvider, type NavigationTarget, useNavigationHandoff } from './navigation-handoff';
export { CONTACTS_ROUTE_PATTERNS, contactsRoutes } from './routes';
export { default as ContactDetailScreen, type ContactDetailScreenProps, type ContactDetailTab } from './screens/contact-detail';
export { default as ContactsListScreen, type ContactsListScreenProps } from './screens/contacts-list';
