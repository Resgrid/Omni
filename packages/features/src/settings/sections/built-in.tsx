import React from 'react';

import { setBuiltInSettingsSections, type SettingsSection } from '../registry';
import { AccountSection } from './account-section';
import { LocationSection } from './location-section';
import { NotificationsSection } from './notifications-section';
import { AboutSection, AdvancedSection, LogoutSection } from './other-sections';
import { PreferencesSection } from './preferences-section';
import { UnitSection } from './unit-section';
import { VoiceSection } from './voice-section';

/**
 * The shared sections (omni-plan §7.10): Responder's items + Unit's unit selection + the U/D sounds, each shown by
 * capability. Order leaves gaps for variant sections (e.g. 35 Dispatch weather sources, 45 BigBoard display).
 */
export const BUILT_IN_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'account', order: 10, title: 'settings.account', visible: (context) => context.isAuthenticated, render: () => <AccountSection /> },
  { id: 'unit', order: 20, title: 'settings.unit_selection', visible: (context) => context.isAuthenticated && context.capabilities.status.subject === 'unit', render: () => <UnitSection /> },
  { id: 'preferences', order: 30, title: 'settings.preferences', render: () => <PreferencesSection /> },
  {
    id: 'notifications',
    order: 40,
    title: 'settings.notifications',
    visible: (context) => context.capabilities.push.subject !== 'none' || context.capabilities.push.desktopPush,
    render: () => <NotificationsSection />,
  },
  {
    id: 'location',
    order: 50,
    title: 'settings.location',
    visible: (context) => context.capabilities.location.transmission !== 'none' || context.capabilities.location.background,
    render: () => <LocationSection />,
  },
  {
    id: 'voice',
    order: 60,
    title: 'settings.audio',
    visible: (context) => context.capabilities.voice.ptt || context.capabilities.voice.bluetoothPtt,
    render: () => <VoiceSection />,
  },
  { id: 'advanced', order: 80, title: 'settings.advanced', render: () => <AdvancedSection /> },
  { id: 'about', order: 90, title: 'settings.about', render: () => <AboutSection /> },
  { id: 'logout', order: 100, title: 'settings.session', visible: (context) => context.isAuthenticated, render: () => <LogoutSection /> },
];

setBuiltInSettingsSections(() => BUILT_IN_SETTINGS_SECTIONS);
