import { parseVariantManifest } from '@resgrid/config';

import manifest from './variant.json';

// Runtime manifest for this app. Validated once at startup so a malformed variant.json fails loudly.
const variant = parseVariantManifest(manifest);

export default variant;
