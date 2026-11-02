// withIconBadge (docs/build/app-icons-and-splash.md): non-store builds get environment/version badges on every icon the
// build shows, including the iOS dark and tinted appearances, and each badge lands on a 1024×1024 canvas.
const fs = require('fs');
const os = require('os');
const path = require('path');

const withIconBadge = require('../plugins/with-icon-badge');
const { createAppConfig } = require('../src/app-config');

const omniRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni');
const badges = [
  { text: 'staging', type: 'banner', color: 'white' },
  { text: '1.2.3', type: 'ribbon', color: 'white' },
];

const pngSize = (file) => {
  const bytes = fs.readFileSync(file);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

describe('getIconTargets', () => {
  it('targets each iOS appearance when ios.icon is an object', () => {
    const config = { icon: 'a.png', ios: { icon: { light: 'a.png', dark: 'd.png', tinted: 't.png' } }, android: { adaptiveIcon: { foregroundImage: 'f.png' } } };
    const targets = withIconBadge.getIconTargets(config);
    expect(targets.map((t) => [t.name, t.source, t.isAdaptiveIcon])).toEqual([
      ['icon', 'a.png', false],
      ['ios-icon', 'a.png', false],
      ['ios-icon-dark', 'd.png', false],
      ['ios-icon-tinted', 't.png', false],
      ['adaptive-icon', 'f.png', true],
    ]);
    targets.find((t) => t.name === 'ios-icon-dark').apply('badged.png');
    expect(config.ios.icon).toEqual({ light: 'a.png', dark: 'badged.png', tinted: 't.png' });
  });

  it('still accepts a single iOS icon path and skips missing appearances', () => {
    const config = { ios: { icon: 'i.png' } };
    const [target] = withIconBadge.getIconTargets(config);
    expect(target.name).toBe('ios-icon');
    target.apply('badged.png');
    expect(config.ios.icon).toBe('badged.png');
    expect(withIconBadge.getIconTargets({ ios: { icon: { light: 'l.png' } } }).map((t) => t.name)).toEqual(['ios-icon']);
  });
});

describe('withIconBadge on a variant icon set', () => {
  let projectRoot;
  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-badge-'));
  });
  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it('badges every icon of a staging build into 1024×1024 outputs', () => {
    const base = createAppConfig({ variant: 'unit', appEnv: 'production', runNumber: 1, projectRoot: omniRoot, env: {} });
    const absolute = (file) => path.resolve(omniRoot, file);
    const config = {
      _internal: { projectRoot },
      icon: absolute(base.icon),
      ios: { icon: { light: absolute(base.ios.icon.light), dark: absolute(base.ios.icon.dark), tinted: absolute(base.ios.icon.tinted) } },
      android: { adaptiveIcon: { ...base.android.adaptiveIcon, foregroundImage: absolute(base.android.adaptiveIcon.foregroundImage) } },
    };
    const sources = [config.icon, ...Object.values(config.ios.icon), config.android.adaptiveIcon.foregroundImage];

    withIconBadge(config, { badges });

    const outputs = [config.icon, ...Object.values(config.ios.icon), config.android.adaptiveIcon.foregroundImage];
    outputs.forEach((output, index) => {
      expect(output).toMatch(/^\.expo[\\/]app-icon-badge[\\/][a-z-]+-[0-9a-f]{12}\.png$/);
      const file = path.join(projectRoot, output);
      expect(pngSize(file)).toEqual([1024, 1024]);
      expect(fs.readFileSync(file).equals(fs.readFileSync(sources[index]))).toBe(false);
    });
    // Background and monochrome layers are not badged.
    expect(config.android.adaptiveIcon.backgroundImage).toBe(base.android.adaptiveIcon.backgroundImage);
    expect(config.android.adaptiveIcon.monochromeImage).toBe(base.android.adaptiveIcon.monochromeImage);
    // Re-evaluating the same config reuses the renders instead of badging a badge.
    withIconBadge(config, { badges });
    expect([config.icon, ...Object.values(config.ios.icon), config.android.adaptiveIcon.foregroundImage]).toEqual(outputs);
    expect(fs.readdirSync(path.join(projectRoot, '.expo', 'app-icon-badge')).sort()).toHaveLength(outputs.length);
  }, 120000);
});
