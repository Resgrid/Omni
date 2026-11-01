// The web Docker image (docker/): the entrypoint's env-config.js generation (run with a POSIX sh when one is available),
// its agreement with the client env and the variant manifests, and the Dockerfile/nginx rules the release plan relies on.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const { CLIENT_ENV_DEFAULTS, loadAllVariants } = require('@resgrid/config-plugins');

const dockerDir = path.resolve(__dirname, '..', '..', '..', 'docker');
const entrypoint = path.join(dockerDir, 'entrypoint.sh');
const script = fs.readFileSync(entrypoint, 'utf8');

function findShell() {
  const candidates = ['sh'];
  if (process.platform === 'win32') {
    candidates.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'sh.exe'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'sh.exe'));
  }
  return candidates.find((candidate) => spawnSync(candidate, ['-c', 'command -v sed >/dev/null && command -v awk >/dev/null && command -v tr >/dev/null'], { stdio: 'ignore' }).status === 0) || null;
}

const shell = findShell();
const describeWithShell = shell ? describe : describe.skip;
if (!shell) {
  console.warn('docker-image.test.js: no POSIX sh with sed/awk/tr found; skipping the entrypoint execution tests (the static checks still run).');
}

const posix = (p) => p.replace(/\\/g, '/');

describe('entrypoint agrees with the app and the manifests', () => {
  it('writes exactly the client env keys', () => {
    const keys = /^ENV_KEYS="([^"]+)"/m.exec(script)[1].split(' ');
    expect(keys).toEqual(Object.keys(CLIENT_ENV_DEFAULTS));
  });

  it('maps every variant to its legacy env prefix', () => {
    for (const manifest of loadAllVariants()) {
      const match = new RegExp(`^\\s+${manifest.id}\\) printf '%s' '([A-Z_]+)' ;;`, 'm').exec(script);
      expect(match && match[1]).toBe(manifest.identity.web.legacyEnvPrefix);
    }
  });
});

describeWithShell('docker/entrypoint.sh', () => {
  let tmp;
  let html;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-entrypoint-'));
    html = path.join(tmp, 'html');
    fs.mkdirSync(path.join(html, 'call'), { recursive: true });
    fs.writeFileSync(path.join(html, 'index.html'), '<!DOCTYPE html><html lang="en"><head><title>Resgrid Unit</title></head><body></body></html>');
    fs.writeFileSync(path.join(html, 'call', 'detail.html'), '<html><head data-x="1"><title>x</title></head></html>');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // A clean environment: only what the shell needs, plus the test's variables.
  const run = (env, args = []) =>
    spawnSync(shell, [posix(entrypoint), ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT, TEMP: process.env.TEMP, TMP: process.env.TMP } : {}),
        HTML_DIR: posix(html),
        NGINX_CSP_FILE: posix(path.join(tmp, 'csp.conf')),
        ...env,
      },
    });

  const readEnv = () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(html, 'env-config.js'), 'utf8'), sandbox);
    return sandbox.window.__ENV__;
  };

  it('prefers unprefixed names, falls back to the legacy prefix, and omits what is unset', () => {
    const result = run({ RESGRID_APP_VARIANT: 'unit', BASE_API_URL: 'https://new.example.com', UNIT_BASE_API_URL: 'https://old.example.com', UNIT_APP_KEY: 'legacy-key', UNIT_COUNTLY_URL: 'https://countly.example.com' });
    expect(result.status).toBe(0);
    expect(readEnv()).toEqual({ BASE_API_URL: 'https://new.example.com', APP_KEY: 'legacy-key', COUNTLY_SERVER_URL: 'https://countly.example.com' });
  });

  it('writes an empty override when nothing is set (the build-time env stays)', () => {
    expect(run({ RESGRID_APP_VARIANT: 'ic' }).status).toBe(0);
    expect(readEnv()).toEqual({});
  });

  it('merges over an existing window.__ENV__', () => {
    run({ RESGRID_APP_VARIANT: 'ic', IC_SENTRY_DSN: 'https://k@sentry.example.com/1' });
    const sandbox = { window: { __ENV__: { BASE_API_URL: 'https://build.example.com' } } };
    vm.runInNewContext(fs.readFileSync(path.join(html, 'env-config.js'), 'utf8'), sandbox);
    expect(sandbox.window.__ENV__).toEqual({ BASE_API_URL: 'https://build.example.com', SENTRY_DSN: 'https://k@sentry.example.com/1' });
  });

  it.each([
    ['responder', 'RESPOND_'],
    ['unit', 'UNIT_'],
    ['ic', 'IC_'],
    ['dispatch', 'DISPATCH_'],
    ['bigboard', 'BIGBOARD_'],
  ])('reads the legacy names for %s (%s)', (variant, prefix) => {
    expect(run({ RESGRID_APP_VARIANT: variant, [`${prefix}CHANNEL_HUB_NAME`]: 'legacyHub', UNIT_LOGGING_KEY: variant === 'unit' ? 'k' : 'not-mine' }).status).toBe(0);
    expect(readEnv()).toEqual(variant === 'unit' ? { CHANNEL_HUB_NAME: 'legacyHub', LOGGING_KEY: 'k' } : { CHANNEL_HUB_NAME: 'legacyHub' });
  });

  it('takes LEGACY_ENV_PREFIX over the variant and refuses a malformed one', () => {
    run({ RESGRID_APP_VARIANT: 'unit', LEGACY_ENV_PREFIX: 'BIGBOARD_', BIGBOARD_API_VERSION: 'v5', UNIT_API_VERSION: 'v3' });
    expect(readEnv()).toEqual({ API_VERSION: 'v5' });
    for (const bad of ['unit_', 'UNIT', '$(id)_', 'A B_']) {
      const result = run({ LEGACY_ENV_PREFIX: bad });
      expect(result.status).toBe(64);
    }
  });

  it('JSON-escapes values and never evaluates them', () => {
    const tricky = 'a"b\\c\nd\te\rf $(echo pwned) `echo pwned` \u0001</script><script>alert(1)</script> é ✓';
    expect(run({ RESGRID_APP_VARIANT: 'dispatch', BASE_API_URL: tricky }).status).toBe(0);
    expect(readEnv().BASE_API_URL).toBe('a"b\\c\nd\te\rf $(echo pwned) `echo pwned` </script><script>alert(1)</script> é ✓');
    expect(fs.readFileSync(path.join(html, 'env-config.js'), 'utf8')).not.toContain('\npwned');
  });

  it('injects the script tag once into every HTML file', () => {
    run({ RESGRID_APP_VARIANT: 'unit' });
    run({ RESGRID_APP_VARIANT: 'unit' });
    const index = fs.readFileSync(path.join(html, 'index.html'), 'utf8');
    expect(index).toBe('<!DOCTYPE html><html lang="en"><head><script src="/env-config.js"></script><title>Resgrid Unit</title></head><body></body></html>');
    expect(fs.readFileSync(path.join(html, 'call', 'detail.html'), 'utf8')).toBe('<html><head data-x="1"><script src="/env-config.js"></script><title>x</title></head></html>');
  });

  it('prints without writing in --print-env-config mode', () => {
    const result = run({ RESGRID_APP_VARIANT: 'unit', UNIT_APP_KEY: 'k' }, ['--print-env-config']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"APP_KEY": "k"');
    expect(fs.existsSync(path.join(html, 'env-config.js'))).toBe(false);
    expect(fs.readFileSync(path.join(html, 'index.html'), 'utf8')).not.toContain('env-config.js');
  });

  it('replaces the nginx CSP only with a safe CONTENT_SECURITY_POLICY', () => {
    expect(run({ CONTENT_SECURITY_POLICY: "default-src 'self'; connect-src 'self' https://api.example.com" }).status).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'csp.conf'), 'utf8')).toBe("add_header Content-Security-Policy \"default-src 'self'; connect-src 'self' https://api.example.com\" always;\n");
    for (const bad of ['a" always; add_header X "y', 'a $host', 'a\\b']) {
      expect(run({ CONTENT_SECURITY_POLICY: bad }).status).toBe(64);
    }
  });

  it('runs the command afterwards, and fails without an export', () => {
    const result = run({ RESGRID_APP_VARIANT: 'unit' }, ['echo', 'nginx started']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('nginx started');
    fs.rmSync(path.join(html, 'index.html'));
    expect(run({ RESGRID_APP_VARIANT: 'unit' }).status).toBe(1);
  });
});

describe('Dockerfile and nginx', () => {
  const dockerfile = fs.readFileSync(path.join(dockerDir, 'Dockerfile'), 'utf8');
  const nginx = fs.readFileSync(path.join(dockerDir, 'nginx.conf'), 'utf8');
  const headers = fs.readFileSync(path.join(dockerDir, 'nginx', 'security-headers.conf'), 'utf8');
  const csp = fs.readFileSync(path.join(dockerDir, 'nginx', 'csp.conf'), 'utf8');

  it('is a runtime-only nginx image fed by the prebuilt export', () => {
    expect(dockerfile).toMatch(/^ARG NGINX_IMAGE=nginx:alpine$/m);
    expect(dockerfile).toMatch(/^ARG APP_VARIANT$/m);
    expect(dockerfile).toMatch(/^COPY apps\/omni\/dist\/\$\{APP_VARIANT\}\/ \/usr\/share\/nginx\/html\/$/m);
    // No compile or install steps: multi-arch builds need no emulation.
    expect(dockerfile).not.toMatch(/^RUN /m);
    const instructions = dockerfile.replace(/^#.*$/gm, '');
    expect(instructions).not.toMatch(/\b(npm|yarn|pnpm|npx|expo)\b/i);
  });

  it('never caches entry HTML or runtime env and long-caches hashed bundles', () => {
    expect(nginx).toMatch(/location = \/index\.html \{[^}]*no-store/);
    expect(nginx).toMatch(/location = \/env-config\.js \{[^}]*no-store/);
    expect(nginx).toMatch(/location \^~ \/_expo\/static\/ \{[^}]*immutable/);
    expect(nginx).toMatch(/location ~ \/\\\. \{[^}]*deny all/);
    expect(nginx).toMatch(/location = \/health \{[^}]*return 200/);
    expect(nginx).toMatch(/location = \/\.well-known\/apple-app-site-association \{[^}]*application\/json[^}]*=404/);
    expect(nginx).toMatch(/location = \/\.well-known\/assetlinks\.json \{/);
    expect(nginx).toMatch(/try_files \$uri \$uri\.html \$uri\/ \/index\.html;/);
  });

  it('sends the security headers and a CSP without inline-script escape hatches for frames or plugins', () => {
    expect(headers).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
    expect(headers).toContain('X-Content-Type-Options "nosniff"');
    expect(headers).toContain('include /etc/nginx/resgrid/csp.conf;');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https: wss:");
    expect(csp).not.toMatch(/connect-src[^;]* http:/);
  });
});
