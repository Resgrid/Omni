#!/usr/bin/env node
// Writes the description of the pull request that produced a release's commit as a section of the release notes
// (release.yml stage 3: the GitHub Release body, Firebase App Distribution and Changerawr). A push to master builds the
// commit GitHub made when it merged the pull request; a tag or dispatch run builds the commit it points at, which has
// one when a merge made it. Only merged pull requests count: an open one that contains the commit did not produce it.
//
// HTML comments (the template's hints, the markers summary bots wrap their text in) are removed and the headings are
// stepped down below the section's own ### heading. The file is left empty when no merged pull request is found or
// GitHub cannot be reached: the notes never stop a release.
//
// Usage: node scripts/ci/pr-summary.mjs --commit <sha> --out pr-summary.md     (GITHUB_TOKEN, GITHUB_REPOSITORY)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { githubClient, parseArgs, requireArg } from './lib.mjs';

// Level of the section heading; the description's headings start one level below it.
const SECTION_LEVEL = 3;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/** The merged pull request that produced `sha`: the one merged as that commit, else the first merged one listing it. */
export function pickPullRequest(pulls, sha) {
  const merged = (Array.isArray(pulls) ? pulls : []).filter((p) => p?.merged_at);
  return merged.find((p) => p.merge_commit_sha === sha) ?? merged[0] ?? null;
}

/** The description without HTML comments, its shallowest heading at `level + 1`, and runs of blank lines collapsed. */
export function cleanDescription(body, level = SECTION_LEVEL) {
  const lines = String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  let shallowest = 7;
  outsideFences(lines, (line) => {
    const m = HEADING.exec(line);
    if (m) shallowest = Math.min(shallowest, m[2].length);
    return line;
  });
  const shift = Math.max(0, level + 1 - shallowest);
  return outsideFences(lines, (line) => line.replace(HEADING, (_, indent, hashes) => indent + '#'.repeat(Math.min(6, hashes.length + shift))))
    .join('\n')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    .trim();
}

/** The release-notes section for one pull request. */
export function formatPullRequest(pr) {
  const description = cleanDescription(pr.body);
  return [`${'#'.repeat(SECTION_LEVEL)} Pull request [#${pr.number}](${pr.html_url}): ${pr.title}`, '', ...(description ? [description, ''] : [])].join('\n');
}

// Applies fn to every line outside fenced code blocks.
function outsideFences(lines, fn) {
  let open = null;
  return lines.map((line) => {
    const m = FENCE.exec(line);
    if (m) {
      if (!open) open = m[1];
      else if (m[1][0] === open[0] && m[1].length >= open.length) open = null;
      return line;
    }
    return open ? line : fn(line);
  });
}

async function main() {
  const args = parseArgs();
  const commit = requireArg(args, 'commit');
  const out = path.resolve(requireArg(args, 'out'));
  fs.writeFileSync(out, '');
  const client = githubClient();
  if (!client) {
    console.log('GITHUB_TOKEN / GITHUB_REPOSITORY not set; no pull request in the release notes.');
    return;
  }
  let pr;
  try {
    pr = pickPullRequest(await client.pullsForCommit(commit), commit);
  } catch (error) {
    console.log(`::warning::Could not look up the pull request for ${commit.slice(0, 12)}: ${error.message}`);
    return;
  }
  if (!pr) {
    console.log(`No merged pull request produced ${commit.slice(0, 12)}; the release notes list the commits only.`);
    return;
  }
  fs.writeFileSync(out, formatPullRequest(pr));
  console.log(`Release notes include pull request #${pr.number}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
