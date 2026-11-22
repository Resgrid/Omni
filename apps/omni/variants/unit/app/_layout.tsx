import '../../../theme-styles';
import '../../../shell-registrations';

import { configureAppShell } from '@resgrid/app-shell';
import { setActiveVariant } from '@resgrid/config';
import { unitResources } from '@resgrid/i18n/resources/unit';
import { configureNotificationSounds } from '@resgrid/notifications';

import { NOTIFICATION_SOUNDS } from '../../../sound-sets/unit';
import { VOICE_SOUNDS } from '../../../voice-sounds';
import { nav, routes } from '../nav';
import variant from '../variant';

setActiveVariant(variant);
configureAppShell({ variant, i18nResources: unitResources, nav, routes, options: { voiceSounds: VOICE_SOUNDS } });

// The in-app player plays this app's sound set (the Dispatch app has its own; web exports bundle only their app's).
configureNotificationSounds(NOTIFICATION_SOUNDS);

export { RootLayout as default, ErrorBoundary } from '@resgrid/app-shell';
