// Every namespace at once — for tests and tooling. Apps import only `common` (through initI18n) and their own
// namespace module, so a build never ships the other four apps' strings.
import { SUPPORTED_LANGUAGES } from '../languages';
import { type Namespace, NAMESPACES } from '../namespaces';
import { bigboardResources } from './bigboard';
import { commonResources } from './common';
import { dispatchResources } from './dispatch';
import { icResources } from './ic';
import { responderResources } from './responder';
import type { NamespaceResources, NamespaceTranslations, TranslationTree } from './types';
import { unitResources } from './unit';

export const allNamespaceResources: Record<Namespace, NamespaceResources> = {
  common: commonResources,
  responder: responderResources,
  unit: unitResources,
  ic: icResources,
  dispatch: dispatchResources,
  bigboard: bigboardResources,
};

/** Every namespace with every language loaded. */
export async function loadAllNamespaceTranslations(): Promise<Record<Namespace, NamespaceTranslations>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const resources = allNamespaceResources[ns];
      const languages = await Promise.all(SUPPORTED_LANGUAGES.map(async (lang): Promise<[string, TranslationTree]> => [lang, lang === 'en' ? resources.en : (await resources.loaders[lang]()).default]));
      return [ns, Object.fromEntries(languages) as NamespaceTranslations] as const;
    })
  );
  return Object.fromEntries(entries) as Record<Namespace, NamespaceTranslations>;
}
