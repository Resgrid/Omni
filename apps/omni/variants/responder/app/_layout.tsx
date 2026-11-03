import '../../../theme-styles';
import '../../../shell-registrations';

import { configureAppShell } from '@resgrid/app-shell';
import { setActiveVariant } from '@resgrid/config';
import { responderResources } from '@resgrid/i18n/resources/responder';

import { VOICE_SOUNDS } from '../../../voice-sounds';
import { nav, routes } from '../nav';
import variant from '../variant';

setActiveVariant(variant);
configureAppShell({ variant, i18nResources: responderResources, nav, routes, options: { voiceSounds: VOICE_SOUNDS } });

export { RootLayout as default, ErrorBoundary } from '@resgrid/app-shell';
