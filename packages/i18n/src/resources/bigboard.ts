// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/bigboard/ar.json';
import de from '../translations/bigboard/de.json';
import el from '../translations/bigboard/el.json';
import en from '../translations/bigboard/en.json';
import es from '../translations/bigboard/es.json';
import fr from '../translations/bigboard/fr.json';
import it from '../translations/bigboard/it.json';
import pl from '../translations/bigboard/pl.json';
import sv from '../translations/bigboard/sv.json';
import uk from '../translations/bigboard/uk.json';
import type { NamespaceResources } from './types';

export const bigboardResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
