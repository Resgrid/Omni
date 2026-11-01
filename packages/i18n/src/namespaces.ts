import type { VariantId } from '@resgrid/config';

/** `common` holds strings shared by two or more apps; each app has its own namespace for the rest. */
export const NAMESPACES = ['common', 'responder', 'unit', 'ic', 'dispatch', 'bigboard'] as const satisfies readonly ('common' | VariantId)[];
export type Namespace = (typeof NAMESPACES)[number];

export const COMMON_NAMESPACE = 'common' satisfies Namespace;
