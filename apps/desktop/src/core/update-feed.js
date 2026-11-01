'use strict';
// Auto-update feed per variant and channel (omni-plan §6.6.5): electron-updater's generic provider reading
// `${UPDATE_BASE_URL}/updates/<variant>/<channel>/`. Never the GitHub provider — the five apps share one repository's
// releases, so "latest release" would point at another app. No electron import (unit-tested).

const UPDATE_CHANNELS = ['production', 'staging', 'internal'];
const VARIANT_PATTERN = /^[a-z][a-z0-9-]*$/;

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** The release channel for this build: RELEASE_CHANNEL (CI) or `production`. */
function resolveUpdateChannel(env = process.env) {
  const channel = (env.RELEASE_CHANNEL || 'production').trim();
  if (!UPDATE_CHANNELS.includes(channel)) {
    throw new Error(`RELEASE_CHANNEL must be one of ${UPDATE_CHANNELS.join(', ')}; got "${channel}".`);
  }
  return channel;
}

/**
 * The feed URL, or null when no base URL is configured (auto-update disabled).
 * @param {string | undefined | null} baseUrl UPDATE_BASE_URL
 * @param {string} variant
 * @param {string} channel
 * @returns {string | null}
 */
function resolveUpdateFeedUrl(baseUrl, variant, channel) {
  if (baseUrl === undefined || baseUrl === null || String(baseUrl).trim() === '') {
    return null;
  }
  if (!VARIANT_PATTERN.test(variant)) {
    throw new Error(`Invalid variant for the update feed: "${variant}".`);
  }
  if (!UPDATE_CHANNELS.includes(channel)) {
    throw new Error(`Invalid update channel "${channel}". Expected one of ${UPDATE_CHANNELS.join(', ')}.`);
  }
  let url;
  try {
    url = new URL(String(baseUrl).trim());
  } catch {
    throw new Error('UPDATE_BASE_URL is not a valid URL.');
  }
  // Updates are executable code: https only (http only to a local test server).
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('UPDATE_BASE_URL must use https.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('UPDATE_BASE_URL must not contain credentials, a query or a fragment.');
  }
  const base = url.toString().replace(/\/+$/, '');
  return `${base}/updates/${variant}/${channel}/`;
}

/**
 * Whether this process should run electron-updater. Portable Windows builds cannot update themselves (electron-updater
 * supports the NSIS installer only), and unpackaged runs have no app-update metadata.
 * @param {{ feedUrl: string | null, isPackaged: boolean, platform: string, env?: Record<string, string | undefined> }} options
 */
function shouldEnableAutoUpdate({ feedUrl, isPackaged, platform, env = process.env }) {
  if (!feedUrl || !isPackaged) {
    return false;
  }
  if (platform === 'win32' && env.PORTABLE_EXECUTABLE_DIR) {
    return false;
  }
  return env.RESGRID_DISABLE_AUTO_UPDATE !== '1';
}

module.exports = { UPDATE_CHANNELS, resolveUpdateChannel, resolveUpdateFeedUrl, shouldEnableAutoUpdate };
