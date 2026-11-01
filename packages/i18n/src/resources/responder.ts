// One module per namespace, so each app bundles only `common` plus its own strings (see initI18n).
// The JSON comes from scripts/merge-legacy-translations.mjs.
import ar from '../translations/responder/ar.json';
import de from '../translations/responder/de.json';
import el from '../translations/responder/el.json';
import en from '../translations/responder/en.json';
import es from '../translations/responder/es.json';
import fr from '../translations/responder/fr.json';
import it from '../translations/responder/it.json';
import pl from '../translations/responder/pl.json';
import sv from '../translations/responder/sv.json';
import uk from '../translations/responder/uk.json';
import type { NamespaceResources } from './types';

export const responderResources: NamespaceResources = { en, ar, de, el, es, fr, it, pl, sv, uk };
