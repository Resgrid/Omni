import '../../../theme-styles';
import '../../../shell-registrations';

import { configureAppShell } from '@resgrid/app-shell';
import { setActiveVariant } from '@resgrid/config';
import { unitResources } from '@resgrid/i18n/resources/unit';

import { nav, routes } from '../nav';
import variant from '../variant';

setActiveVariant(variant);
configureAppShell({ variant, i18nResources: unitResources, nav, routes });

export { RootLayout as default, ErrorBoundary } from '@resgrid/app-shell';
