#!/usr/bin/env node
// The isolated QA stack from the Core checkout (Docker/qa-departments/stack/qa-stack.py): `pnpm qa:stack <command>`.
//   up [--no-build]   build Core from that checkout, migrate a fresh database, seed and verify the QA departments
//   seed | verify | unlock | status | logs [service] | down
// The Core checkout is QA_CORE_DIR or ../Core. `pnpm qa:regression <variant>` brings the stack up by itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = path.resolve(process.env.QA_CORE_DIR || path.join(root, '..', 'Core'));
const script = path.join(core, 'Docker', 'qa-departments', 'stack', 'qa-stack.py');

if (!fs.existsSync(script)) {
  console.error(`qa-stack: no ${path.relative(root, script)}; set QA_CORE_DIR to the Core checkout.`);
  process.exit(2);
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const result = spawnSync('python3', [script, ...(args.length ? args : ['status'])], { stdio: 'inherit' });

if (result.error) console.error(`qa-stack: python3 could not start: ${result.error.message}`);

process.exit(result.status ?? 1);
