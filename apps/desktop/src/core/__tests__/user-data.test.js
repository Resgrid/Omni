const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrateLegacyUserData } = require('../user-data');

const from = { dir: 'dispatch', marker: 'settings.json', entries: ['settings.json', 'Local Storage'] };

describe('migrateLegacyUserData', () => {
  let appData;
  beforeEach(() => {
    appData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-appdata-'));
  });
  afterEach(() => fs.rmSync(appData, { recursive: true, force: true }));

  const legacyBigBoardProfile = () => {
    const legacy = path.join(appData, 'dispatch');
    fs.mkdirSync(path.join(legacy, 'Local Storage', 'leveldb'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'settings.json'), JSON.stringify({ baseUrl: 'https://api.example.com' }));
    fs.writeFileSync(path.join(legacy, 'Local Storage', 'leveldb', '000003.log'), 'data');
    fs.writeFileSync(path.join(legacy, 'Cookies'), 'not copied');
    return legacy;
  };

  it("copies a legacy BigBoard profile's settings and localStorage once", () => {
    const legacy = legacyBigBoardProfile();
    const target = path.join(appData, 'resgrid-bigboard');
    expect(migrateLegacyUserData({ appDataDir: appData, targetDir: target, from })).toBe('migrated');
    expect(JSON.parse(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'))).toEqual({ baseUrl: 'https://api.example.com' });
    expect(fs.readFileSync(path.join(target, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('data');
    expect(fs.existsSync(path.join(target, 'Cookies'))).toBe(false);
    // The legacy folder is left alone (legacy Dispatch may still use it).
    expect(fs.existsSync(path.join(legacy, 'settings.json'))).toBe(true);
    expect(migrateLegacyUserData({ appDataDir: appData, targetDir: target, from })).toBe('target-exists');
  });

  it('leaves a Dispatch-only profile alone (no BigBoard marker)', () => {
    fs.mkdirSync(path.join(appData, 'dispatch', 'Local Storage'), { recursive: true });
    const target = path.join(appData, 'resgrid-bigboard');
    expect(migrateLegacyUserData({ appDataDir: appData, targetDir: target, from })).toBe('no-legacy-profile');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('does nothing for variants without a migration', () => {
    expect(migrateLegacyUserData({ appDataDir: appData, targetDir: path.join(appData, 'unit'), from: null })).toBe('not-configured');
  });

  it('removes a half-copied profile when the copy fails', () => {
    legacyBigBoardProfile();
    const target = path.join(appData, 'resgrid-bigboard');
    const fsImpl = {
      ...fs,
      cpSync: () => {
        throw new Error('disk full');
      },
    };
    expect(migrateLegacyUserData({ appDataDir: appData, targetDir: target, from, fsImpl })).toBe('failed');
    expect(fs.existsSync(target)).toBe(false);
  });
});
