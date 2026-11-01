// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/unit/ar.json';
import de from '../translations/unit/de.json';
import el from '../translations/unit/el.json';
import en from '../translations/unit/en.json';
import es from '../translations/unit/es.json';
import fr from '../translations/unit/fr.json';
import it from '../translations/unit/it.json';
import pl from '../translations/unit/pl.json';
import sv from '../translations/unit/sv.json';
import uk from '../translations/unit/uk.json';
import type { NamespaceResources } from './types';

export const unitResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
