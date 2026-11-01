// Validates every variant manifest against the full zod schema (omni-plan §5.3) and checks that each
// variant has its route tree and required assets. Run by `pnpm variants:check` and CI.
import fs from 'node:fs';
import path from 'node:path';

import { parseVariantManifest, VARIANT_IDS } from '@resgrid/config';

const variantsDir = path.resolve(__dirname, '..', 'apps', 'omni', 'variants');
const requiredAssets = ['icon.png', 'ios-icon.png', 'adaptive-icon.png', 'favicon.png', 'notification-icon.png'];
const problems: string[] = [];

for (const id of VARIANT_IDS) {
  const dir = path.join(variantsDir, id);
  try {
    const manifest = parseVariantManifest(JSON.parse(fs.readFileSync(path.join(dir, 'variant.json'), 'utf8')));
    if (manifest.id !== id) problems.push(`${id}: manifest id is "${manifest.id}"`);
  } catch (error) {
    problems.push(`${id}: ${(error as Error).message}`);
  }
  for (const file of ['variant.ts', 'app/_layout.tsx']) {
    if (!fs.existsSync(path.join(dir, file))) problems.push(`${id}: missing ${file}`);
  }
  for (const asset of requiredAssets) {
    if (!fs.existsSync(path.join(dir, 'assets', asset))) problems.push(`${id}: missing assets/${asset}`);
  }
}

if (problems.length) {
  console.error(`Variant check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${VARIANT_IDS.length} variants are valid.`);
