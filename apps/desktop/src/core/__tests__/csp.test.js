const { buildContentSecurityPolicy } = require('../csp');

const directive = (csp, name) => {
  const hit = csp.split('; ').find((d) => d.startsWith(`${name} `));
  return hit ? hit.slice(name.length + 1).split(' ') : null;
};

describe('buildContentSecurityPolicy', () => {
  it('locks production to the app origin, https and wss', () => {
    const csp = buildContentSecurityPolicy({ appOrigins: ['app://bundle'] });
    expect(directive(csp, 'default-src')).toEqual(["'self'", 'app://bundle']);
    expect(directive(csp, 'script-src')).toEqual(["'self'", 'app://bundle', "'unsafe-inline'", "'wasm-unsafe-eval'"]);
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toEqual(expect.arrayContaining(['https:', 'wss:']));
    expect(directive(csp, 'connect-src')).not.toContain('http:');
    expect(directive(csp, 'connect-src')).not.toContain('ws:');
    expect(directive(csp, 'img-src')).not.toContain('http:');
    expect(directive(csp, 'worker-src')).toContain('blob:');
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    expect(csp).not.toMatch(/\*(?!:)/);
  });

  it('adds the dev server, HMR and loopback http only in development', () => {
    const csp = buildContentSecurityPolicy({ appOrigins: ['http://localhost:8081'], devServerOrigin: 'http://localhost:8081' });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toEqual(expect.arrayContaining(['ws://localhost:*', 'http://127.0.0.1:*']));
    expect(directive(csp, 'default-src')).toEqual(["'self'", 'http://localhost:8081']);
  });

  it("includes BigBoard's loopback origin", () => {
    const csp = buildContentSecurityPolicy({ appOrigins: ['http://127.0.0.1:29317'] });
    expect(directive(csp, 'default-src')).toEqual(["'self'", 'http://127.0.0.1:29317']);
  });

  it("leaves Dispatch's app://. origin to 'self' (not a valid CSP host-source)", () => {
    const csp = buildContentSecurityPolicy({ appOrigins: ['app://.'] });
    expect(csp).not.toContain('app://.');
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
  });

  it('refuses origins that could inject directives', () => {
    expect(() => buildContentSecurityPolicy({ appOrigins: [] })).toThrow();
    expect(() => buildContentSecurityPolicy({ appOrigins: ["app://bundle; script-src 'unsafe-eval'"] })).toThrow();
    expect(() => buildContentSecurityPolicy({ appOrigins: ['app://bundle'], devServerOrigin: 'http://x y' })).toThrow();
  });
});
