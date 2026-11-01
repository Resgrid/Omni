'use strict';
// The desktop shell's per-variant configuration. scripts/build.mjs (and dev.mjs) write it to app-bundle/variant-config.json
// from the variant manifest (apps/omni/variants/<v>/variant.json) and the release environment; main.js reads and
// validates it at startup. The main process never reads the manifest itself, so the installer carries only what it needs.
// No electron import (unit-tested).

const fs = require('fs');

const { LEGACY_DESKTOP_IDENTITY } = require('./legacy-identity');
const { resolveUpdateFeedUrl, UPDATE_CHANNELS } = require('./update-feed');

const SCHEMA_VERSION = 1;
const VARIANT_IDS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;
const RESERVED_SCHEMES = new Set(['app', 'http', 'https', 'file', 'ws', 'wss', 'data', 'blob', 'javascript', 'about', 'chrome', 'devtools']);

/** `ResgridUnit` for "Resgrid Unit": the release-asset prefix (omni-plan §6.6.4). */
function artifactPrefixFor(manifest) {
  return manifest.identity.name.replace(/[^A-Za-z0-9]/g, '');
}

/**
 * @param {object} manifest variant manifest (variant.json)
 * @param {{ version: string, channel?: string, updateBaseUrl?: string | null }} options
 */
function createVariantConfig(manifest, { version, channel = 'production', updateBaseUrl = null }) {
  const electron = manifest.identity && manifest.identity.electron;
  if (!electron) {
    throw new Error(`Variant "${manifest.id}" has no identity.electron.`);
  }
  const legacy = LEGACY_DESKTOP_IDENTITY[manifest.id];
  if (!legacy) {
    throw new Error(`No desktop identity for variant "${manifest.id}".`);
  }
  return validateVariantConfig({
    schemaVersion: SCHEMA_VERSION,
    variant: manifest.id,
    appId: electron.appId,
    productName: electron.productName,
    protocol: electron.protocol ? electron.protocol.toLowerCase() : null,
    version,
    channel,
    updateFeedUrl: resolveUpdateFeedUrl(updateBaseUrl, manifest.id, channel),
    userDataDir: legacy.userDataDir,
    bundleHost: legacy.bundleHost,
    loopback: legacy.loopback ? { ...legacy.loopback } : null,
    settingsIpc: legacy.settingsIpc === true,
    migrateUserDataFrom: legacy.migrateFrom ? { ...legacy.migrateFrom, entries: [...legacy.migrateFrom.entries] } : null,
  });
}

function fail(message) {
  throw new Error(`variant-config.json: ${message}`);
}

function isPlainName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\\/:*?"<>|\u0000-\u001f]/.test(value) && value !== '.' && value !== '..';
}

/**
 * Checks a parsed config and returns it frozen. Throws with the offending field on anything unexpected — a broken
 * config must stop the app, not silently fall back to another variant's identity.
 * @param {any} value
 */
function validateVariantConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('not an object');
  if (value.schemaVersion !== SCHEMA_VERSION) fail(`unsupported schemaVersion ${value.schemaVersion}`);
  if (!VARIANT_IDS.includes(value.variant)) fail(`unknown variant "${value.variant}"`);
  if (typeof value.appId !== 'string' || !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value.appId)) fail(`invalid appId "${value.appId}"`);
  if (typeof value.productName !== 'string' || value.productName.trim() === '') fail('missing productName');
  if (value.protocol !== null && (typeof value.protocol !== 'string' || !SCHEME_PATTERN.test(value.protocol) || RESERVED_SCHEMES.has(value.protocol))) {
    fail(`invalid protocol "${value.protocol}"`);
  }
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) fail(`invalid version "${value.version}"`);
  if (!UPDATE_CHANNELS.includes(value.channel)) fail(`invalid channel "${value.channel}"`);
  if (value.updateFeedUrl !== null && (typeof value.updateFeedUrl !== 'string' || !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(value.updateFeedUrl))) {
    fail('updateFeedUrl must be an https URL or null');
  }
  if (!isPlainName(value.userDataDir)) fail(`invalid userDataDir "${value.userDataDir}"`);
  if (value.bundleHost !== '.' && !(typeof value.bundleHost === 'string' && /^[a-z0-9-]+$/.test(value.bundleHost))) fail(`invalid bundleHost "${value.bundleHost}"`);
  if (value.loopback !== null) {
    const { host, port } = value.loopback || {};
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1024 || port > 65535) fail('loopback must be { host: "127.0.0.1", port: 1024-65535 } or null');
  }
  if (typeof value.settingsIpc !== 'boolean') fail('settingsIpc must be a boolean');
  if (value.migrateUserDataFrom !== null) {
    const m = value.migrateUserDataFrom || {};
    if (!isPlainName(m.dir) || !isPlainName(m.marker) || !Array.isArray(m.entries) || !m.entries.every(isPlainName)) fail('invalid migrateUserDataFrom');
  }
  return Object.freeze({
    ...value,
    loopback: value.loopback ? Object.freeze({ ...value.loopback }) : null,
    migrateUserDataFrom: value.migrateUserDataFrom ? Object.freeze({ ...value.migrateUserDataFrom, entries: Object.freeze([...value.migrateUserDataFrom.entries]) }) : null,
  });
}

/** Reads and validates app-bundle/variant-config.json. */
function loadVariantConfig(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`variant-config.json not found at ${filePath} (run scripts/build.mjs or scripts/dev.mjs first): ${error.code || error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('not valid JSON');
  }
  return validateVariantConfig(parsed);
}

/** The origin the packaged app is served from: `app://<bundleHost>`, or BigBoard's loopback origin. */
function bundleOriginFor(config) {
  return config.loopback ? `http://${config.loopback.host}:${config.loopback.port}` : `app://${config.bundleHost}`;
}

module.exports = { SCHEMA_VERSION, VARIANT_IDS, artifactPrefixFor, bundleOriginFor, createVariantConfig, loadVariantConfig, validateVariantConfig };
