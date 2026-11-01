// BigBoard's loopback origin: fixed port when free, a random one when taken, path guard, Host check, CSP on HTML.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { startLoopbackServer } = require('../loopback-server');

const request = (port, urlPath, { host = `127.0.0.1:${port}`, method = 'GET' } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

describe('startLoopbackServer', () => {
  let root;
  const servers = [];
  const log = { warn: jest.fn() };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-loopback-'));
    fs.mkdirSync(path.join(root, '_expo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.html'), '<html>board</html>');
    fs.writeFileSync(path.join(root, '_expo', 'app.js'), 'console.log(1)');
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves the export on the requested port with CSP on HTML', async () => {
    const port = await freePort();
    const started = await startLoopbackServer(root, { host: '127.0.0.1', port, csp: "default-src 'self'", log });
    servers.push(started.server);
    expect(started).toMatchObject({ origin: `http://127.0.0.1:${port}`, port, fallback: false });

    const index = await request(port, '/');
    expect(index.status).toBe(200);
    expect(index.body).toBe('<html>board</html>');
    expect(index.headers['content-security-policy']).toBe("default-src 'self'");
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8');

    const route = await request(port, '/dashboard/2');
    expect(route.body).toBe('<html>board</html>');

    const js = await request(port, '/_expo/app.js');
    expect(js.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(js.headers['x-content-type-options']).toBe('nosniff');

    expect((await request(port, '/_expo/missing.js')).status).toBe(404);
    expect((await request(port, '/..%5c..%5cwin.ini')).status).toBe(403);
    expect((await request(port, '/', { method: 'POST' })).status).toBe(405);
    // DNS rebinding: another host name pointing at 127.0.0.1.
    expect((await request(port, '/', { host: `evil.example:${port}` })).status).toBe(403);
  });

  it('falls back to a random port when the fixed one is taken', async () => {
    const port = await freePort();
    const blocker = http.createServer();
    await new Promise((resolve) => blocker.listen(port, '127.0.0.1', resolve));
    servers.push(blocker);

    const started = await startLoopbackServer(root, { host: '127.0.0.1', port, csp: "default-src 'self'", log });
    servers.push(started.server);
    expect(started.fallback).toBe(true);
    expect(started.port).not.toBe(port);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(`Port ${port} is in use`));
    expect((await request(started.port, '/')).status).toBe(200);
  });
});
