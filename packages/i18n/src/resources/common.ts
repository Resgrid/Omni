// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/common/ar.json';
import de from '../translations/common/de.json';
import el from '../translations/common/el.json';
import en from '../translations/common/en.json';
import es from '../translations/common/es.json';
import fr from '../translations/common/fr.json';
import it from '../translations/common/it.json';
import pl from '../translations/common/pl.json';
import sv from '../translations/common/sv.json';
import uk from '../translations/common/uk.json';
import type { NamespaceResources } from './types';

export const commonResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
