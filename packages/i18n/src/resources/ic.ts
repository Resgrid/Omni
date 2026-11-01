// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/ic/ar.json';
import de from '../translations/ic/de.json';
import el from '../translations/ic/el.json';
import en from '../translations/ic/en.json';
import es from '../translations/ic/es.json';
import fr from '../translations/ic/fr.json';
import it from '../translations/ic/it.json';
import pl from '../translations/ic/pl.json';
import sv from '../translations/ic/sv.json';
import uk from '../translations/ic/uk.json';
import type { NamespaceResources } from './types';

export const icResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
