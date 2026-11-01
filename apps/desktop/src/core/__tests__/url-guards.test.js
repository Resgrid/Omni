const fs = require('fs');
const os = require('os');
const path = require('path');

const { isAllowedNavigation, isPermissionAllowed, isSafeExternalUrl, originOf, resolveBundleRequest, safeDevServerUrl, safeExternalUrl } = require('../url-guards');

describe('originOf', () => {
  it('derives scheme://host for custom schemes, where WHATWG origin is "null"', () => {
    expect(originOf('app://bundle/index.html')).toBe('app://bundle');
    expect(originOf('app://./index.html')).toBe('app://.');
    expect(originOf('APP://Bundle/x')).toBe('app://bundle');
    expect(originOf('http://127.0.0.1:29317/home')).toBe('http://127.0.0.1:29317');
  });

  it('refuses credentials, backslashes, junk and oversized values', () => {
    expect(originOf('http://127.0.0.1:29317@evil.com/')).toBeNull();
    expect(originOf('https://user:pass@evil.com/')).toBeNull();
    expect(originOf('app://bundle\\..\\x')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf(undefined)).toBeNull();
    expect(originOf(`https://a.com/${'x'.repeat(9000)}`)).toBeNull();
    expect(originOf('file:///etc/passwd')).toBeNull();
  });
});

describe('isAllowedNavigation', () => {
  const allowed = ['app://bundle'];

  it('allows only the app origin', () => {
    expect(isAllowedNavigation('app://bundle/calls/12', allowed)).toBe(true);
    expect(isAllowedNavigation('app://bundle', allowed)).toBe(true);
    expect(isAllowedNavigation('app://other/index.html', allowed)).toBe(false);
    expect(isAllowedNavigation('https://evil.com/', allowed)).toBe(false);
    expect(isAllowedNavigation('file:///C:/Windows/win.ini', allowed)).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)', allowed)).toBe(false);
  });

  it('is not fooled by look-alike hosts, credentials, encoding or backslashes', () => {
    const dev = ['http://localhost:8081'];
    expect(isAllowedNavigation('http://localhost:8081.evil.com/', dev)).toBe(false);
    expect(isAllowedNavigation('http://localhost:8081@evil.com/', dev)).toBe(false);
    expect(isAllowedNavigation('http://localhost:8082/', dev)).toBe(false);
    expect(isAllowedNavigation('http://localhost:8081\\@evil.com', dev)).toBe(false);
    expect(isAllowedNavigation('app://bundle%2f..%2f@evil.com/', allowed)).toBe(false);
    expect(isAllowedNavigation('app://bundle.evil.com/', allowed)).toBe(false);
    expect(isAllowedNavigation('https://localhost:8081/', dev)).toBe(false);
  });

  it("matches BigBoard's loopback origin exactly", () => {
    const loopback = ['http://127.0.0.1:29317'];
    expect(isAllowedNavigation('http://127.0.0.1:29317/dashboard', loopback)).toBe(true);
    expect(isAllowedNavigation('http://127.0.0.1:29318/', loopback)).toBe(false);
    expect(isAllowedNavigation('http://localhost:29317/', loopback)).toBe(false);
  });
});

describe('safeExternalUrl / isSafeExternalUrl (IC external links)', () => {
  it('lets http(s) out, normalized', () => {
    expect(safeExternalUrl('https://resgrid.com/docs')).toBe('https://resgrid.com/docs');
    expect(safeExternalUrl('HTTP://Example.com')).toBe('http://example.com/');
    expect(isSafeExternalUrl('https://maps.example.com/?q=1')).toBe(true);
  });

  it('keeps every other scheme and trick in', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'smb://host/share',
      'resgridunit://call/1',
      'ms-msdt:/id',
      'data:text/html,hi',
      'https://bank.com@evil.com/',
      'https:\\\\evil.com',
      ' https://x.com',
      'https://',
      42,
      null,
    ]) {
      expect(safeExternalUrl(url)).toBeNull();
    }
  });
});

describe('resolveBundleRequest', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-bundle-'));
    fs.mkdirSync(path.join(root, '_expo', 'static', 'js'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(root, '_expo', 'static', 'js', 'index-abc.js'), '1');
    fs.writeFileSync(path.join(root, 'favicon.ico'), '1');
    fs.writeFileSync(path.join(path.dirname(root), 'omni-secret.txt'), 'secret');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.join(path.dirname(root), 'omni-secret.txt'), { force: true });
  });

  const req = (p) => resolveBundleRequest(root, `app://bundle${p}`);

  it('serves files inside the export', () => {
    expect(req('/_expo/static/js/index-abc.js')).toEqual({ status: 200, filePath: path.join(root, '_expo', 'static', 'js', 'index-abc.js'), fallback: false });
    expect(req('/favicon.ico')).toMatchObject({ status: 200, fallback: false });
    expect(req('/')).toEqual({ status: 200, filePath: path.join(root, 'index.html'), fallback: false });
    expect(req('/favicon.ico?v=2#x')).toMatchObject({ status: 200, filePath: path.join(root, 'favicon.ico') });
  });

  it('falls back to index.html for routes and 404s for missing assets', () => {
    expect(req('/calls/123')).toEqual({ status: 200, filePath: path.join(root, 'index.html'), fallback: true });
    expect(req('/_expo')).toEqual({ status: 200, filePath: path.join(root, 'index.html'), fallback: true });
    expect(req('/_expo/static/js/missing.js')).toEqual({ status: 404 });
  });

  it('never leaves the root', () => {
    for (const p of ['/../omni-secret.txt', '/..%2fomni-secret.txt', '/%2e%2e/omni-secret.txt', '/%2e%2e%2fomni-secret.txt', '/_expo/../../omni-secret.txt', '/%252e%252e/omni-secret.txt']) {
      const result = req(p);
      if (result.status === 200) {
        expect(result.filePath.startsWith(root)).toBe(true);
        expect(result.filePath).not.toContain('omni-secret');
      }
    }
  });

  it('refuses backslashes (raw or encoded), NUL bytes and bad escapes', () => {
    expect(req('/..%5comni-secret.txt')).toEqual({ status: 403 });
    expect(req('/%5c%5cserver%5cshare')).toEqual({ status: 403 });
    expect(resolveBundleRequest(root, 'app://bundle/..\\omni-secret.txt')).toEqual({ status: 403 });
    expect(req('/index.html%00.js')).toEqual({ status: 403 });
    expect(req('/%E0%A4%A')).toEqual({ status: 400 });
    expect(resolveBundleRequest(root, 'not a url')).toEqual({ status: 400 });
  });

  it('never treats drive letters or stream names as files', () => {
    expect(req('/C:/Windows/win.ini')).toEqual({ status: 404 });
    expect(req('/index.html::$DATA')).toEqual({ status: 404 });
    expect(req('/C:')).toEqual({ status: 200, filePath: path.join(root, 'index.html'), fallback: true });
  });
});

describe('isPermissionAllowed', () => {
  it('grants the app the permissions it uses, and nothing to other origins', () => {
    expect(isPermissionAllowed('media', 'app://bundle/', ['app://bundle'])).toBe(true);
    expect(isPermissionAllowed('notifications', 'app://bundle', ['app://bundle'])).toBe(true);
    expect(isPermissionAllowed('geolocation', 'https://evil.com/', ['app://bundle'])).toBe(false);
    expect(isPermissionAllowed('display-capture', 'app://bundle/', ['app://bundle'])).toBe(false);
    expect(isPermissionAllowed('openExternal', 'app://bundle/', ['app://bundle'])).toBe(false);
  });
});

describe('safeDevServerUrl', () => {
  it('accepts only loopback http(s)', () => {
    expect(safeDevServerUrl('http://localhost:8081')).toBe('http://localhost:8081/');
    expect(safeDevServerUrl('http://127.0.0.1:19006/')).toBe('http://127.0.0.1:19006/');
    expect(safeDevServerUrl('https://dev.resgrid.com')).toBeNull();
    expect(safeDevServerUrl('http://localhost@evil.com')).toBeNull();
    expect(safeDevServerUrl('file:///x')).toBeNull();
    expect(safeDevServerUrl(undefined)).toBeNull();
  });
});
