#!/usr/bin/env node
// Writes the description of the pull request that produced a release's commit as a section of the release notes
// (release.yml stage 3: the GitHub Release body, Firebase App Distribution and Changerawr). A push to master builds the
// commit GitHub made when it merged the pull request; a tag or dispatch run builds the commit it points at, which has
// one when a merge made it. Only merged pull requests count: an open one that contains the commit did not produce it.
//
// HTML comments outside fenced code (the template's hints, the markers summary bots wrap their text in) are removed and
// the headings are stepped down below the section's own ### heading. The file is left empty when no merged pull request
// is found or GitHub cannot be reached: the notes never stop a release.
//
// Usage: node scripts/ci/pr-summary.mjs --commit <sha> --out pr-summary.md     (GITHUB_TOKEN, GITHUB_REPOSITORY)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fenceAfter, githubClient, parseArgs, requireArg } from './lib.mjs';

// Level of the section heading; the description's headings start one level below it.
const SECTION_LEVEL = 3;
const HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;
const COMMENT = /<!--[\s\S]*?-->/g;

/** The merged pull request that produced `sha`: the one merged as that commit, else the first merged one listing it. */
export function pickPullRequest(pulls, sha) {
  const merged = (Array.isArray(pulls) ? pulls : []).filter((p) => p?.merged_at);
  return merged.find((p) => p.merge_commit_sha === sha) ?? merged[0] ?? null;
}

/** The description without HTML comments, its shallowest heading at `level + 1`, and runs of blank lines collapsed. */
export function cleanDescription(body, level = SECTION_LEVEL) {
  const lines = withoutComments(
    String(body ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
  );
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
    const fenced = open !== null || fenceAfter(null, line) !== null;
    open = fenceAfter(open, line);
    return fenced ? line : fn(line);
  });
}

// Removes HTML comments, keeping fenced code (an HTML or XML example) as written. Read in order, as Markdown does: a
// comment may span lines, fence markers inside it included; one that never closes stays as text.
function withoutComments(lines) {
  const out = [];
  let open = null;
  let comment = null; // { before, lines }: the text ahead of a comment still open, and the lines it has taken so far
  for (const line of lines) {
    let text = line;
    if (comment) {
      const end = line.indexOf('-->');
      if (end === -1) {
        comment.lines.push(line);
        continue;
      }
      text = comment.before + line.slice(end + 3);
      comment = null;
    } else if (open !== null || fenceAfter(null, line) !== null) {
      open = fenceAfter(open, line);
      out.push(line);
      continue;
    }
    text = text.replace(COMMENT, '');
    const start = text.indexOf('<!--');
    if (start === -1) out.push(text);
    else comment = { before: text.slice(0, start), lines: [text.slice(start)] };
  }
  return comment ? [...out, comment.before + comment.lines[0], ...comment.lines.slice(1)] : out;
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
