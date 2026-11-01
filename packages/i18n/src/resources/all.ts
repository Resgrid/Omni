// Every namespace at once — for tests and tooling. Apps import only `common` (through initI18n) and their own
// namespace module, so a build never ships the other four apps' strings.
import type { Namespace } from '../namespaces';
import { bigboardResources } from './bigboard';
import { commonResources } from './common';
import { dispatchResources } from './dispatch';
import { icResources } from './ic';
import { responderResources } from './responder';
import type { NamespaceResources } from './types';
import { unitResources } from './unit';

export const allNamespaceResources: Record<Namespace, NamespaceResources> = {
  common: commonResources,
  responder: responderResources,
  unit: unitResources,
  ic: icResources,
  dispatch: dispatchResources,
  bigboard: bigboardResources,
};
