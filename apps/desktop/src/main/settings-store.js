'use strict';
// BigBoard's main-process settings (opt-in per variant, variant-config `settingsIpc`). Renderer settings kept in a JSON
// file under userData as well as localStorage, so they survive a launch that could not get the fixed loopback port (a
// different origin, so none of the usual localStorage). The server URL is one of them: signing in to the wrong server is
// worse than signing in again. Ported from the legacy BigBoard electron/main.js. No electron import (unit-tested).

const fs = require('fs');
const path = require('path');

const PERSISTED_SETTING_KEYS = new Set(['baseUrl']);
const MAX_SETTING_LENGTH = 2048;

/** @param {string} filePath settings.json under userData */
function createSettingsStore(filePath) {
  const read = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const write = (settings) => {
    const tempPath = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write-then-rename so a crash mid-write never leaves a truncated settings file behind.
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  };

  return {
    /** @returns {string | null} */
    get(key) {
      if (!PERSISTED_SETTING_KEYS.has(key)) {
        return null;
      }
      const value = read()[key];
      return typeof value === 'string' ? value : null;
    },
    /** @returns {boolean} */
    set(key, value) {
      const isValidValue = value === null || (typeof value === 'string' && value.length <= MAX_SETTING_LENGTH);
      if (!PERSISTED_SETTING_KEYS.has(key) || !isValidValue) {
        return false;
      }
      const settings = read();
      if (value === null) {
        delete settings[key];
      } else {
        settings[key] = value;
      }
      write(settings);
      return true;
    },
  };
}

/**
 * Synchronous IPC so the renderer can read the server URL while its modules are still loading (the API client resolves
 * its base URL at import time). Register through the trusted IPC facade: the server URL decides where credentials go.
 * @param {{ on: Function }} trustedIpc
 * @param {ReturnType<typeof createSettingsStore>} store
 * @param {{ error: Function }} [log]
 */
function registerSettingsIpc(trustedIpc, store, log = console) {
  trustedIpc.on('settings:get', (event, key) => {
    event.returnValue = store.get(key);
  });
  trustedIpc.on('settings:set', (event, key, value) => {
    try {
      event.returnValue = store.set(key, value);
    } catch (error) {
      log.error(`Failed to persist setting "${String(key)}"`, error && error.message);
      event.returnValue = false;
    }
  });
}

module.exports = { MAX_SETTING_LENGTH, PERSISTED_SETTING_KEYS, createSettingsStore, registerSettingsIpc };
