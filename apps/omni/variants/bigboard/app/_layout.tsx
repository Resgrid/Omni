import '../../../theme-styles';
import '../../../shell-registrations';

import { configureAppShell } from '@resgrid/app-shell';
import { setActiveVariant } from '@resgrid/config';
import { bigboardResources } from '@resgrid/i18n/resources/bigboard';

import { nav, routes } from '../nav';
import variant from '../variant';

setActiveVariant(variant);
configureAppShell({ variant, i18nResources: bigboardResources, nav, routes });

export { RootLayout as default, ErrorBoundary } from '@resgrid/app-shell';
