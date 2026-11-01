'use strict';
// An ipcMain facade that only answers the app's own page. Every bridge (push, SSO, settings, notifications, updates)
// registers through it, so a frame from any other origin — remote content that slipped into the window, or another
// server on loopback — gets nothing. No electron import (unit-tested).

const { originOf } = require('../core/url-guards');

/**
 * @param {{ handle: Function, on: Function }} ipcMain
 * @param {() => string[]} getAllowedOrigins evaluated per message (BigBoard's loopback port is known only after start)
 * @param {{ warn: Function }} [log]
 */
function createTrustedIpc(ipcMain, getAllowedOrigins, log = console) {
  const isTrusted = (event) => {
    let frameUrl;
    try {
      frameUrl = event && event.senderFrame ? event.senderFrame.url : null;
    } catch {
      frameUrl = null;
    }
    const origin = originOf(frameUrl);
    return origin !== null && getAllowedOrigins().some((allowed) => allowed.toLowerCase() === origin);
  };

  return {
    isTrusted,
    /** Like ipcMain.handle; an untrusted sender's invoke is rejected. */
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrusted(event)) {
          log.warn(`Refused IPC "${channel}" from an untrusted frame`);
          throw new Error('Untrusted sender');
        }
        return handler(event, ...args);
      });
    },
    /** Like ipcMain.on; an untrusted sender's sync call gets null. */
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        if (!isTrusted(event)) {
          log.warn(`Refused IPC "${channel}" from an untrusted frame`);
          event.returnValue = null;
          return;
        }
        listener(event, ...args);
      });
    },
  };
}

module.exports = { createTrustedIpc };
