// withNotificationSounds (omni-plan D17, §7.6, §10.2a): only the modern sound set and the custom tones reach the native
// projects, every Android channel's sound is bundled, and iOS also gets the modern sound under each classic server
// sound name so classic sound types play modern sounds there too.
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockAddedResources = [];

jest.mock('expo/config-plugins', () => ({
  withXcodeProject: (config, action) => ({ ...config, mockIosMods: [...(config.mockIosMods || []), action] }),
  withDangerousMod: (config, [platform, action]) => ({ ...config, mockDangerousMods: [...(config.mockDangerousMods || []), { platform, action }] }),
  IOSConfig: {
    Paths: { getSourceRoot: (projectRoot) => require('path').join(projectRoot, 'ios', 'App') },
    XcodeUtils: {
      addResourceFileToGroup: ({ filepath, project }) => {
        mockAddedResources.push(filepath);
        project.files.add(filepath);
        return project;
      },
    },
  },
}));

const plugin = require('../plugins/withNotificationSounds');
const sounds = require('../../notifications/src/sounds');
const { ANDROID_CHANNELS } = require('../../notifications/src/channels');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const omniRoot = path.join(repoRoot, 'apps', 'omni');

/** Core NovuProvider.GetSoundFileNameFromType for the classic types (0–6; 6 falls through to "{type}.wav"). */
const CORE_CLASSIC_SOUND_FILES = ['callemergency', 'callhigh', 'callmedium', 'calllow', 'notification', 'message', '6'];
/** Files only the legacy apps shipped; none may reach an Omni build. */
const CLASSIC_FILES = [
  'callclosed',
  'callupdated',
  'newcall',
  'newchat',
  'newmessage',
  'newshift',
  'newtraining',
  'personnelstaffingupdated',
  'personnelstatusupdated',
  'troublealert',
  'unitnotice',
  'unitstatusupdated',
  'upcomingshift',
  'upcomingtraining',
];

const stem = (fileName) => fileName.replace(/\.wav$/, '');

function makeProject() {
  const files = new Set();
  return { files, hasFile: (file) => files.has(file) };
}

const tempRoots = [];

function makeTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-sounds-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'assets', 'audio', 'custom'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ios', 'App'), { recursive: true });
  for (const sound of plugin.getSoundFiles()) {
    fs.writeFileSync(path.join(root, sound.source), `audio:${sound.source}`);
  }
  return root;
}

describe('withNotificationSounds', () => {
  beforeEach(() => {
    mockAddedResources.length = 0;
  });

  afterAll(() => {
    for (const root of tempRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps its sound lists identical to @resgrid/notifications', () => {
    expect(plugin.MODERN_SOUNDS).toEqual([...sounds.MODERN_SOUNDS]);
    expect(plugin.CUSTOM_TONE_COUNT).toBe(sounds.CUSTOM_TONE_COUNT);
    expect(plugin.IOS_SERVER_SOUND_ALIASES).toEqual({ ...sounds.IOS_SERVER_SOUND_ALIASES });
  });

  it('bundles only modern sounds and custom tones, and every file exists in apps/omni/assets/audio', () => {
    const files = [...plugin.getAndroidSoundFiles(), ...plugin.getIosSoundFiles()];
    for (const file of files) {
      expect(file.source).toMatch(/^assets\/audio\/(modern[a-z]+|custom\/c([1-9]|1\d|2[0-5]))\.wav$/);
      expect(fs.existsSync(path.join(omniRoot, file.source))).toBe(true);
    }
    expect(plugin.getAndroidSoundFiles()).toHaveLength(sounds.MODERN_SOUNDS.length + sounds.CUSTOM_TONE_COUNT);
  });

  it('ships no classic sound file under its own source on either platform', () => {
    const sources = [...plugin.getAndroidSoundFiles(), ...plugin.getIosSoundFiles()].map((file) => path.basename(file.source, '.wav'));
    for (const classic of [...CLASSIC_FILES, ...CORE_CLASSIC_SOUND_FILES]) {
      expect(sources).not.toContain(classic);
    }
  });

  it('bundles the sound of every Android channel the app creates, with valid resource names', () => {
    const androidNames = new Set(plugin.getAndroidSoundFiles().map((file) => stem(file.fileName)));
    for (const channel of ANDROID_CHANNELS) {
      expect(androidNames.has(channel.sound)).toBe(true);
    }
    for (const name of androidNames) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('gives iOS the modern sound under every classic server sound name, and modern names for types 7+ and custom tones', () => {
    const ios = new Map(plugin.getIosSoundFiles().map((file) => [stem(file.fileName), path.basename(file.source, '.wav')]));
    for (const serverName of CORE_CLASSIC_SOUND_FILES) {
      expect(ios.get(serverName)).toMatch(/^modern/);
    }
    expect(ios.get('callemergency')).toBe('moderncallemergency');
    expect(ios.get('message')).toBe('modernmessage');
    expect(ios.get('6')).toBe('modernnotification');
    for (const modern of sounds.MODERN_SOUNDS) {
      expect(ios.get(modern)).toBe(modern);
    }
    for (let tone = 1; tone <= 25; tone++) {
      expect(ios.get(`c${tone}`)).toBe(`c${tone}`);
    }
  });

  it('copies the Android sounds into res/raw', () => {
    const root = makeTempProject();
    plugin.setNotificationSoundsAndroid(root, plugin.getAndroidSoundFiles());
    const raw = path.join(root, 'android', 'app', 'src', 'main', 'res', 'raw');
    expect(fs.readdirSync(raw).sort()).toEqual(
      plugin
        .getAndroidSoundFiles()
        .map((file) => file.fileName)
        .sort()
    );
    expect(fs.readFileSync(path.join(raw, 'moderncallemergency.wav'), 'utf8')).toBe('audio:assets/audio/moderncallemergency.wav');
  });

  it('copies the iOS sounds and aliases into the Xcode project once', () => {
    const root = makeTempProject();
    const project = makeProject();
    plugin.setNotificationSoundsIOS(root, { sounds: plugin.getIosSoundFiles(), project, projectName: 'App' });
    expect(fs.readFileSync(path.join(root, 'ios', 'App', 'callemergency.wav'), 'utf8')).toBe('audio:assets/audio/moderncallemergency.wav');
    expect(fs.readFileSync(path.join(root, 'ios', 'App', '6.wav'), 'utf8')).toBe('audio:assets/audio/modernnotification.wav');
    expect(project.files.has('App/c25.wav')).toBe(true);
    const added = mockAddedResources.length;

    plugin.setNotificationSoundsIOS(root, { sounds: plugin.getIosSoundFiles(), project, projectName: 'App' });
    expect(mockAddedResources).toHaveLength(added);
  });

  it('rejects a missing project name or sound list', () => {
    expect(() => plugin.setNotificationSoundsIOS('/tmp', { sounds: [], project: makeProject(), projectName: undefined })).toThrow(/project name/);
    expect(() => plugin.setNotificationSoundsAndroid('/tmp', 'nope')).toThrow(/array of sound files/);
  });

  it('registers an iOS and an Android mod that write into the native projects', () => {
    const root = makeTempProject();
    const config = plugin({ name: 'Test' });
    expect(config.mockIosMods).toHaveLength(1);
    expect(config.mockDangerousMods).toHaveLength(1);
    expect(config.mockDangerousMods[0].platform).toBe('android');

    const project = makeProject();
    const iosResult = config.mockIosMods[0]({ modRequest: { projectRoot: root, projectName: 'App' }, modResults: project });
    expect(iosResult.modResults.files.has('App/moderncallemergency.wav')).toBe(true);
    expect(iosResult.modResults.files.has('App/callhigh.wav')).toBe(true);

    config.mockDangerousMods[0].action({ modRequest: { projectRoot: root } });
    expect(fs.existsSync(path.join(root, 'android', 'app', 'src', 'main', 'res', 'raw', 'c1.wav'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'android', 'app', 'src', 'main', 'res', 'raw', 'callhigh.wav'))).toBe(false);
  });
});
