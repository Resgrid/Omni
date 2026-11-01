'use strict';
// Deep links on the app's protocol (e.g. resgridunit://call/123). The OS hands them to the main process (open-url on
// macOS, a second instance's argv on Windows/Linux, the first instance's argv on a cold start); the main process queues
// them until the page has subscribed, then forwards them. No electron import (unit-tested).

const MAX_DEEP_LINK_LENGTH = 4096;
const MAX_PENDING = 20;

/**
 * The normalized link when `value` is a URL on one of `schemes`, else null.
 * @param {unknown} value
 * @param {string[]} schemes lowercase scheme names without ':'
 * @returns {string | null}
 */
function parseDeepLink(value, schemes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_DEEP_LINK_LENGTH || !Array.isArray(schemes) || schemes.length === 0) {
    return null;
  }
  const trimmed = value.trim();
  // Control characters never belong in a link and are how argument-injection payloads hide.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (!schemes.map((s) => s.toLowerCase()).includes(scheme)) {
    return null;
  }
  return url.href;
}

/**
 * The first deep link among process arguments (a second instance's argv, or this instance's on a cold start).
 * @param {unknown} argv
 * @param {string[]} schemes
 */
function findDeepLink(argv, schemes) {
  if (!Array.isArray(argv)) {
    return null;
  }
  for (const arg of argv) {
    const link = parseDeepLink(arg, schemes);
    if (link) {
      return link;
    }
  }
  return null;
}

/**
 * Holds links until a page has subscribed (Dispatch sent one pending link on did-finish-load, which raced the page's
 * own subscription). A reload marks the page unsubscribed again; links that arrive meanwhile wait, oldest dropped
 * first beyond `maxPending`.
 * @param {{ send: (link: string) => boolean, maxPending?: number }} options send returns false when no page can take it
 */
function createDeepLinkQueue({ send, maxPending = MAX_PENDING }) {
  const pending = [];
  let ready = false;

  const enqueue = (link) => {
    pending.push(link);
    while (pending.length > maxPending) {
      pending.shift();
    }
  };

  return {
    /** A link from the OS. */
    push(link) {
      if (ready && send(link)) {
        return;
      }
      enqueue(link);
    },
    /** The page subscribed: it takes everything that waited. */
    subscribe() {
      ready = true;
      return pending.splice(0, pending.length);
    },
    /** The page went away (reload, navigation, window closed). */
    reset() {
      ready = false;
    },
    get size() {
      return pending.length;
    },
    get ready() {
      return ready;
    },
  };
}

module.exports = { createDeepLinkQueue, findDeepLink, parseDeepLink, MAX_DEEP_LINK_LENGTH };
