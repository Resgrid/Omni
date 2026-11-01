#!/usr/bin/env node
// Mirrors .claude/skills (canonical, committed) into .agents/skills (gitignored) for agents that read the
// agentskills.io location (Codex, OpenCode, others). Run after adding or editing a skill:
//   node scripts/sync-agent-skills.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.claude', 'skills');
const target = path.join(root, '.agents', 'skills');

if (!fs.existsSync(source)) {
  console.error(`No skills found at ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

const names = fs
  .readdirSync(target, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
console.log(`Mirrored ${names.length} skills to ${path.relative(root, target)}: ${names.join(', ')}`);
