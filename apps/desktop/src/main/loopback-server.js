'use strict';
// BigBoard's loopback file server (opt-in per variant, variant-config `loopback`). Legacy BigBoard served its export from
// http://127.0.0.1:29317 rather than app://; the port is part of the page origin and localStorage (sign-in, dashboard
// layout, preferences) is keyed by origin, so existing boards keep this origin. Ported from the legacy BigBoard
// electron/main.js, with the shared path guard (url-guards.resolveBundleRequest) and a Host check against DNS
// rebinding. No electron import (unit-tested).

const fs = require('fs');
const http = require('http');
const path = require('path');

const { resolveBundleRequest } = require('../core/url-guards');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.pmtiles': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param {string} rootDir web export
 * @param {{ csp: string, getPort: () => number | null }} options
 */
function createFileServer(rootDir, { csp, getPort }) {
  return http.createServer((req, res) => {
    const port = getPort();
    // Only this origin: a DNS-rebinding page reaches 127.0.0.1 under its own host name.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const result = resolveBundleRequest(rootDir, `http://127.0.0.1:${port}${req.url && req.url.startsWith('/') ? req.url : '/'}`);
    if (result.status !== 200) {
      res.writeHead(result.status).end();
      return;
    }
    fs.readFile(result.filePath, (error, data) => {
      if (error) {
        res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
        return;
      }
      const ext = path.extname(result.filePath).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      };
      if (ext === '.html') {
        headers['Content-Security-Policy'] = csp;
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

/**
 * Serves `rootDir` on host:port. If another program holds the port the app still starts on an OS-picked port, but that
 * session sees none of the data stored under the usual origin.
 * @param {string} rootDir
 * @param {{ host: string, port: number, csp: string, log?: { warn: Function } }} options
 * @returns {Promise<{ server: import('http').Server, origin: string, port: number, fallback: boolean }>}
 */
async function startLoopbackServer(rootDir, { host, port, csp, log = console }) {
  let boundPort = null;
  const getPort = () => boundPort;
  const server = createFileServer(rootDir, { csp, getPort });
  try {
    boundPort = await listen(server, host, port);
    return { server, origin: `http://${host}:${boundPort}`, port: boundPort, fallback: false };
  } catch (error) {
    if (!error || error.code !== 'EADDRINUSE') {
      throw error;
    }
    log.warn(`Port ${port} is in use by another program; using a random port. Data saved in earlier sessions is unavailable until it is freed.`);
    const fallbackServer = createFileServer(rootDir, { csp, getPort });
    boundPort = await listen(fallbackServer, host, 0);
    return { server: fallbackServer, origin: `http://${host}:${boundPort}`, port: boundPort, fallback: true };
  }
}

module.exports = { MIME_TYPES, startLoopbackServer };
