#!/usr/bin/env node
// Fits the release notes to one service's size limit (release.yml stage 3): GitHub Releases take 125,000 characters,
// Firebase App Distribution 65,536 bytes. A pull request description can make the notes longer than either, and an
// over-long body fails that step. Notes within the limit are copied unchanged; longer ones keep their leading whole
// lines (the build summary and the pull request heading with its link come first), close a code fence the cut left
// open, and end with --note, which says where the full text is. Lines are never split, so no character is cut in two.
//
// Usage: node scripts/ci/fit-notes.mjs --in RELEASE_NOTES.md --out notes.md --max-bytes 65536 --note "Full notes: <url>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fenceAfter, parseArgs, requireArg } from './lib.mjs';

const bytes = (text) => Buffer.byteLength(text, 'utf8');

/** `text` when it fits in `maxBytes` (UTF-8), else its leading whole lines and `note`, within `maxBytes`. */
export function fitNotes(text, maxBytes, note) {
  if (bytes(text) <= maxBytes) return text;
  const tail = `\n\n${note}\n`;
  const kept = [];
  let used = 0;
  let open = null;
  for (const line of text.split('\n')) {
    const after = fenceAfter(open, line);
    // The line and its newline, plus the closing fence the cut would need after it.
    const size = bytes(line) + 1;
    if (used + size + (after ? after.length + 1 : 0) + bytes(tail) > maxBytes) break;
    kept.push(line);
    used += size;
    open = after;
  }
  if (open) kept.push(open);
  const fitted = kept.join('\n').trimEnd();
  return fitted ? `${fitted}${tail}` : `${note}\n`;
}

function main() {
  const args = parseArgs();
  const input = requireArg(args, 'in');
  const out = requireArg(args, 'out');
  const maxBytes = Number(requireArg(args, 'max-bytes'));
  const note = requireArg(args, 'note');
  if (!Number.isInteger(maxBytes) || maxBytes <= bytes(`\n\n${note}\n`)) throw new Error(`--max-bytes must be an integer larger than the note (${maxBytes})`);
  const text = fs.readFileSync(input, 'utf8');
  const fitted = fitNotes(text, maxBytes, note);
  fs.writeFileSync(out, fitted);
  console.log(fitted === text ? `${out}: the notes fit (${bytes(text)} of ${maxBytes} bytes).` : `${out}: notes shortened from ${bytes(text)} to ${bytes(fitted)} bytes (limit ${maxBytes}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
