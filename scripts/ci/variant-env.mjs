#!/usr/bin/env node
// Prints the build environment for one variant × channel as KEY=value lines for $GITHUB_ENV.
// Secrets live in one GitHub Environment per variant under identical names (omni-plan D14); the only
// per-variant name is the MMKV encryption key, which the manifest declares as `storage.keySecret`
// (e.g. UNIT_MMKV_KEY). CI stores it as MMKV_KEY in every environment and this maps it across.
//
// Usage: node scripts/ci/variant-env.mjs --variant unit --channel internal >> "$GITHUB_ENV"
import { appEnvForChannel, loadManifest, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs();
const variant = requireArg(args, 'variant');
const channel = requireArg(args, 'channel');
const manifest = loadManifest(variant);

const lines = [`APP_VARIANT=${variant}`, `APP_ENV=${appEnvForChannel(channel)}`, 'EXPO_NO_DOTENV=1'];
const mmkvKey = process.env.MMKV_KEY;
if (mmkvKey) {
  if (/[\r\n]/.test(mmkvKey)) throw new Error('MMKV_KEY must be a single line.');
  lines.push(`${manifest.storage.keySecret}=${mmkvKey}`);
} else {
  console.error(`::warning::MMKV_KEY is not set in the "${variant}" environment; ${manifest.storage.keySecret} stays unset.`);
}
process.stdout.write(lines.join('\n') + '\n');
