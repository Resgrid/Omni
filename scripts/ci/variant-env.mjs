#!/usr/bin/env node
// Prints the build environment for one variant × channel as KEY=value lines for $GITHUB_ENV.
// Secrets live in one GitHub Environment per variant under identical names (omni-plan D14). MMKV encryption
// keys are not build inputs: each device generates its own (omni-plan D8).
//
// Usage: node scripts/ci/variant-env.mjs --variant unit --channel internal >> "$GITHUB_ENV"
import { appEnvForChannel, assertVariant, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs();
const variant = requireArg(args, 'variant');
const channel = requireArg(args, 'channel');
assertVariant(variant);

const lines = [`APP_VARIANT=${variant}`, `APP_ENV=${appEnvForChannel(channel)}`, 'EXPO_NO_DOTENV=1'];
process.stdout.write(lines.join('\n') + '\n');
