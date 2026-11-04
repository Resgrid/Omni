// The dev server's proxy to Resgrid servers (metro/dev-api-proxy.js), run against a real upstream on this machine. The
// app side that builds the URLs is `toDevProxyUrl` in @resgrid/core (packages/core/src/env/__tests__/dev-proxy.test.ts).
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDevApiProxy, parseProxyTarget, withDevApiProxy } = require('../metro/dev-api-proxy');

interface Sent {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface Upstream {
  port: number;
  requests: { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }[];
  close(): Promise<void>;
}

const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      // SAFETY: a server listening on a TCP port reports an AddressInfo (a string only for pipes and sockets).
      const address = server.address() as AddressInfo;

      resolve(address.port);
    })
  );

const closeServer = (server: http.Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

const startUpstream = async (handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void): Promise<Upstream> => {
  const requests: Upstream['requests'] = [];

  const server = http.createServer((req, res) => {
    let body = '';

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });

  const port = await listen(server);

  return { port, requests, close: () => closeServer(server) };
};

const send = (port: number, path: string, options: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string } = {}): Promise<Sent> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: { host: `localhost:${port}`, ...options.headers } }, (res) => {
      let body = '';

      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });

    req.on('error', reject);
    req.end(options.body);
  });

describe('dev API proxy', () => {
  let proxy: http.Server;
  let proxyPort: number;
  let passedOn: string[];
  const log = jest.fn();

  beforeEach(async () => {
    passedOn = [];
    log.mockReset();

    const middleware = createDevApiProxy({ log });

    proxy = http.createServer((req, res) =>
      middleware(req, res, () => {
        passedOn.push(req.url ?? '');
        res.end('metro');
      })
    );
    proxyPort = await listen(proxy);
  });
  afterEach(() => closeServer(proxy));

  it('reads the target from the path the app builds', () => {
    // The same literal packages/core builds.
    expect(parseProxyTarget('/__resgrid-dev-proxy/https/api.resgrid.com/api/v4/connect/token?x=1')?.href).toBe('https://api.resgrid.com/api/v4/connect/token?x=1');
    expect(parseProxyTarget('/__resgrid-dev-proxy/https/qaapi.resgrid.dev:8443/')?.href).toBe('https://qaapi.resgrid.dev:8443/');
    expect(parseProxyTarget('/__resgrid-dev-proxy/http/localhost:5000/api/v4')?.href).toBe('http://localhost:5000/api/v4');
  });

  it('refuses targets it must not reach: plain http off this machine, user info, other schemes', () => {
    expect(parseProxyTarget('/__resgrid-dev-proxy/http/api.resgrid.com/api/v4')).toBeNull();
    expect(parseProxyTarget('/__resgrid-dev-proxy/https/user@api.resgrid.com/api/v4')).toBeNull();
    expect(parseProxyTarget('/__resgrid-dev-proxy/ftp/api.resgrid.com/')).toBeNull();
    expect(parseProxyTarget('/__resgrid-dev-proxy/https')).toBeNull();
    expect(parseProxyTarget('/api/v4/Calls')).toBeNull();
  });

  it('forwards the request and returns the response without cookies, CORS or HSTS headers', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=1',
        'Access-Control-Allow-Origin': 'https://dispatch.resgrid.com',
        'Strict-Transport-Security': 'max-age=31536000',
        'X-Resgrid-Reason': 'kept',
      });
      res.end('{"error":"invalid_request"}');
    });

    try {
      const sent = await send(proxyPort, `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/api/v4/connect/token?scope=openid`, {
        method: 'POST',
        headers: { Origin: `http://localhost:${proxyPort}`, 'Sec-Fetch-Site': 'same-origin', Cookie: 'expo=1', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Resgrid-Client': 'dispatch' },
        body: 'grant_type=password',
      });

      expect(sent.status).toBe(400);
      expect(sent.body).toBe('{"error":"invalid_request"}');
      expect(sent.headers['x-resgrid-reason']).toBe('kept');
      expect(sent.headers['set-cookie']).toBeUndefined();
      expect(sent.headers['access-control-allow-origin']).toBeUndefined();
      expect(sent.headers['strict-transport-security']).toBeUndefined();

      const [received] = upstream.requests;

      expect(received.method).toBe('POST');
      expect(received.url).toBe('/api/v4/connect/token?scope=openid');
      expect(received.body).toBe('grant_type=password');
      expect(received.headers.host).toBe(`127.0.0.1:${upstream.port}`);
      expect(received.headers['x-resgrid-client']).toBe('dispatch');
      expect(received.headers.origin).toBeUndefined();
      expect(received.headers.cookie).toBeUndefined();
    } finally {
      await upstream.close();
    }
  });

  it("returns an auth challenge without the header that opens the browser's sign-in dialog", async () => {
    // The token endpoint's answer on a server where the app's client_id is not registered; the app retries without it.
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Resgrid", error="invalid_client"' });
      res.end('{"error":"invalid_client"}');
    });

    try {
      const sent = await send(proxyPort, `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/api/v4/connect/token`, { method: 'POST', body: 'grant_type=password&client_id=dispatch' });

      expect(sent.status).toBe(401);
      expect(sent.body).toBe('{"error":"invalid_client"}');
      expect(sent.headers['www-authenticate']).toBeUndefined();
    } finally {
      await upstream.close();
    }
  });

  it('streams Server-Sent Events as they arrive', async () => {
    let finish: () => void = () => undefined;

    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: first\n\n');
      finish = () => res.end('data: last\n\n');
    });

    try {
      const firstEvent = await new Promise<string>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: proxyPort, path: `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/eventingHub`, headers: { host: `localhost:${proxyPort}` } }, (res) => {
          res.once('data', (chunk: Buffer) => {
            resolve(chunk.toString());
            finish();
          });
        });

        req.on('error', reject);
        req.end();
      });

      expect(firstEvent).toBe('data: first\n\n');
    } finally {
      await upstream.close();
    }
  });

  it('ends the page’s response when the server drops the body part-way', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: first\n\n', () => res.socket?.destroy());
    });

    try {
      const ended = await new Promise<string>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: proxyPort, path: `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/eventingHub`, headers: { host: `localhost:${proxyPort}` } }, (res) => {
          res.on('error', () => resolve('closed'));
          res.on('close', () => resolve('closed'));
        });

        req.on('error', () => resolve('closed'));
        req.on('timeout', () => reject(new Error('the response stayed open')));
        req.setTimeout(5_000);
        req.end();
      });

      expect(ended).toBe('closed');
    } finally {
      await upstream.close();
    }
  });

  it('drops the headers a Connection header nominates, both ways', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { Connection: 'X-Upstream-Hop', 'X-Upstream-Hop': 'drop', 'X-Upstream-Kept': 'kept' });
      res.end('ok');
    });

    try {
      const sent = await send(proxyPort, `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/api/v4`, { headers: { Connection: 'keep-alive, X-Page-Hop', 'X-Page-Hop': 'drop', 'X-Page-Kept': 'kept' } });

      expect(sent.headers['x-upstream-hop']).toBeUndefined();
      expect(sent.headers['x-upstream-kept']).toBe('kept');

      const [received] = upstream.requests;

      expect(received.headers['x-page-hop']).toBeUndefined();
      expect(received.headers['x-page-kept']).toBe('kept');
    } finally {
      await upstream.close();
    }
  });

  it('keeps redirects on the proxy', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(302, { Location: '/api/v4/Health' });
      res.end();
    });

    try {
      const sent = await send(proxyPort, `/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/api/v4/old`);

      expect(sent.headers.location).toBe(`/__resgrid-dev-proxy/http/127.0.0.1:${upstream.port}/api/v4/Health`);
    } finally {
      await upstream.close();
    }
  });

  it('answers an unreachable server with no response, as the browser would see it', async () => {
    const upstream = await startUpstream(() => undefined);
    const { port } = upstream;

    await upstream.close();
    await expect(send(proxyPort, `/__resgrid-dev-proxy/http/127.0.0.1:${port}/api/v4`)).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('refuses requests from other sites and other host names', async () => {
    const path = '/__resgrid-dev-proxy/https/api.resgrid.com/api/v4';

    expect((await send(proxyPort, path, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await send(proxyPort, path, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    expect((await send(proxyPort, path, { headers: { host: `rebound.example:${proxyPort}` } })).status).toBe(403);
    expect((await send(proxyPort, '/__resgrid-dev-proxy/http/api.resgrid.com/api/v4')).status).toBe(400);
  });

  it('refuses requests from another machine', () => {
    const res = { writeHead: jest.fn(), end: jest.fn() };
    const next = jest.fn();

    createDevApiProxy({ log })({ url: '/__resgrid-dev-proxy/https/api.resgrid.com/', headers: { host: 'localhost:8081' }, socket: { remoteAddress: '192.168.1.20' } }, res, next);

    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(next).not.toHaveBeenCalled();
  });

  it('passes every other request on to the dev server', async () => {
    expect((await send(proxyPort, '/index.bundle?platform=web')).body).toBe('metro');
    expect(passedOn).toEqual(['/index.bundle?platform=web']);
  });
});

describe('withDevApiProxy', () => {
  it('runs in front of the middleware the config already had (Sentry)', () => {
    const sentry = jest.fn((_req: http.IncomingMessage, _res: http.ServerResponse, next: () => void) => next());
    const enhanced = withDevApiProxy({ server: { enhanceMiddleware: () => sentry } }).server.enhanceMiddleware(jest.fn(), {});
    const next = jest.fn();

    enhanced({ url: '/status', headers: {} }, {}, next);

    expect(sentry).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
