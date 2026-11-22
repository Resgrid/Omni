import '../../../theme-styles';
import '../../../shell-registrations';

import { configureAppShell } from '@resgrid/app-shell';
import { setActiveVariant } from '@resgrid/config';
import { responderResources } from '@resgrid/i18n/resources/responder';
import { configureNotificationSounds } from '@resgrid/notifications';

import { NOTIFICATION_SOUNDS } from '../../../sound-sets/responder';
import { VOICE_SOUNDS } from '../../../voice-sounds';
import { nav, routes } from '../nav';
import variant from '../variant';

setActiveVariant(variant);
configureAppShell({ variant, i18nResources: responderResources, nav, routes, options: { voiceSounds: VOICE_SOUNDS } });

// The in-app player plays this app's sound set (the Dispatch app has its own; web exports bundle only their app's).
configureNotificationSounds(NOTIFICATION_SOUNDS);

export { RootLayout as default, ErrorBoundary } from '@resgrid/app-shell';
