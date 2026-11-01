// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/dispatch/ar.json';
import de from '../translations/dispatch/de.json';
import el from '../translations/dispatch/el.json';
import en from '../translations/dispatch/en.json';
import es from '../translations/dispatch/es.json';
import fr from '../translations/dispatch/fr.json';
import it from '../translations/dispatch/it.json';
import pl from '../translations/dispatch/pl.json';
import sv from '../translations/dispatch/sv.json';
import uk from '../translations/dispatch/uk.json';
import type { NamespaceResources } from './types';

export const dispatchResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
