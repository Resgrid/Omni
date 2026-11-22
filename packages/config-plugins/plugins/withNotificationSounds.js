const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { basename, resolve } = require('path');

// Notification sounds for the native projects (omni-plan D17, §7.6, §10.2a): the MODERN sound set and the department
// custom tones only. There are no classic sound files and no modern/classic toggle.
//
// - Android: every sound goes to res/raw under its own name. The app creates one channel per id Core can send
//   (`calls`, "0"–"27", c1–c25, `notif`, `message`) and gives each the modern sound for its meaning
//   (@resgrid/notifications `ANDROID_CHANNELS`), so the channel — not the payload — decides what plays.
// - iOS: the APNs payload names the file to play. Modern types (7+) and custom tones name their own file; classic
//   types (0–6) name their historical file (NovuProvider.GetSoundFileNameFromType). So the modern sound of the same
//   meaning is also bundled under each of those names (`IOS_SERVER_SOUND_ALIASES`), and a department still on classic
//   server settings hears modern sounds on iOS too. Aliases are iOS-only: Android channels set their own sound, and
//   `6` is not a valid Android resource name.
// - Sound set (variant manifest `capabilities.push.soundSet`, passed by app-config.js as `{ soundSet }`): `shared` copies
//   apps/omni/assets/audio; `dispatch` copies the Dispatch app's own files from apps/omni/variants/dispatch/assets/audio
//   under the SAME names (so Core's sound types and the Android channel ids stay 1:1, and an installed app's channels
//   play the new files: notifee stores a channel's sound as `android.resource://<package>/raw/<name>`, resolved when it
//   plays), plus the dispatcher desk sounds (types 28–32), on iOS also under Core's `{type}.wav` fallback names. Every
//   other app bundles no desk file. Department custom tones always come from the shared folder.
//
// Keep MODERN_SOUNDS, DESK_SOUNDS, CUSTOM_TONE_COUNT, SOUND_SETS, IOS_SERVER_SOUND_ALIASES and IOS_DESK_SOUND_ALIASES
// identical to packages/notifications/src/sounds.ts (the plugin test compares them).

const ERROR_MSG_PREFIX = 'An error occurred while configuring notification sounds. ';
const ANDROID_RES_PATH = 'android/app/src/main/res/';
const CUSTOM_TONE_DIR = 'assets/audio/custom';

const MODERN_SOUNDS = [
  'modernavailabilityalert',
  'moderncalendar',
  'moderncallclosed',
  'moderncallemergency',
  'moderncallhigh',
  'moderncalllow',
  'moderncallmedium',
  'moderncallrenotify',
  'moderncallupdated',
  'modernchat',
  'modernmessage',
  'modernnotification',
  'modernpersonnelstatus',
  'modernresourceorder',
  'modernshift',
  'modernstaffing',
  'moderntraining',
  'moderntroublealert',
  'modernunitnotice',
  'modernunitstatus',
  'modernweatheralert',
];

/** The dispatcher desk sounds (Core types 28–32), only in a sound set with `deskSounds`. */
const DESK_SOUNDS = ['modernbreakover', 'modernbreakreminder', 'moderndeskmessage', 'moderndeskoffer', 'moderndeskqueuealert'];

const CUSTOM_TONE_COUNT = 25;

/** The sound sets (manifest `capabilities.push.soundSet`): folder under apps/omni, and whether it has the desk sounds. */
const SOUND_SETS = {
  shared: { dir: 'assets/audio', deskSounds: false },
  dispatch: { dir: 'variants/dispatch/assets/audio', deskSounds: true },
};

/** Server sound file name (classic type) → the modern sound bundled under that name on iOS. */
const IOS_SERVER_SOUND_ALIASES = {
  callemergency: 'moderncallemergency',
  callhigh: 'moderncallhigh',
  callmedium: 'moderncallmedium',
  calllow: 'moderncalllow',
  notification: 'modernnotification',
  message: 'modernmessage',
  6: 'modernnotification',
};

/** Core's `{type}.wav` fallback name (desk type) → the desk sound bundled under that name on iOS (desk sound sets only). */
const IOS_DESK_SOUND_ALIASES = {
  28: 'moderndeskoffer',
  29: 'moderndeskqueuealert',
  30: 'moderndeskmessage',
  31: 'modernbreakreminder',
  32: 'modernbreakover',
};

function soundSetOf(soundSet) {
  if (!Object.prototype.hasOwnProperty.call(SOUND_SETS, soundSet)) {
    throw new Error(ERROR_MSG_PREFIX + `Unknown sound set "${soundSet}". Expected one of: ${Object.keys(SOUND_SETS).join(', ')}.`);
  }

  return SOUND_SETS[soundSet];
}

/** @typedef {{ source: string, fileName: string }} SoundFile  source relative to the project root; fileName in the native project */

/** @returns {SoundFile[]} the set's modern (and desk) sounds and the shared custom tones under their own names (both platforms). */
function getSoundFiles(soundSet = 'shared') {
  const { dir, deskSounds } = soundSetOf(soundSet);
  const stems = deskSounds ? [...MODERN_SOUNDS, ...DESK_SOUNDS] : MODERN_SOUNDS;
  const own = stems.map((stem) => ({ source: `${dir}/${stem}.wav`, fileName: `${stem}.wav` }));
  const custom = Array.from({ length: CUSTOM_TONE_COUNT }, (_, index) => ({ source: `${CUSTOM_TONE_DIR}/c${index + 1}.wav`, fileName: `c${index + 1}.wav` }));

  return [...own, ...custom];
}

/** @returns {SoundFile[]} what iOS bundles: every sound file plus the set's sound under each server name Core may send. */
function getIosSoundFiles(soundSet = 'shared') {
  const { dir, deskSounds } = soundSetOf(soundSet);
  const serverNames = deskSounds ? { ...IOS_SERVER_SOUND_ALIASES, ...IOS_DESK_SOUND_ALIASES } : IOS_SERVER_SOUND_ALIASES;
  const aliases = Object.entries(serverNames).map(([serverName, stem]) => ({ source: `${dir}/${stem}.wav`, fileName: `${serverName}.wav` }));

  return [...getSoundFiles(soundSet), ...aliases];
}

/** @returns {SoundFile[]} what Android bundles in res/raw. */
function getAndroidSoundFiles(soundSet = 'shared') {
  return getSoundFiles(soundSet);
}

function assertSoundList(sounds) {
  if (!Array.isArray(sounds)) {
    throw new Error(ERROR_MSG_PREFIX + `Must provide an array of sound files, found ${typeof sounds}.`);
  }
}

/**
 * Save sound files to the Xcode project root and add them to the Xcode project.
 */
function setNotificationSoundsIOS(projectRoot, { sounds, project, projectName }) {
  if (!projectName) {
    throw new Error(ERROR_MSG_PREFIX + 'Unable to find iOS project name.');
  }
  assertSoundList(sounds);

  const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);

  for (const sound of sounds) {
    const sourceFilepath = resolve(projectRoot, sound.source);
    const destinationFilepath = resolve(sourceRoot, sound.fileName);

    // The same name may hold a different file (e.g. an alias after a sound change), so copy regardless.
    copyFileSync(sourceFilepath, destinationFilepath);

    if (!project.hasFile(`${projectName}/${sound.fileName}`)) {
      project = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${sound.fileName}`,
        groupName: projectName,
        isBuildFile: true,
        project,
      });
    }
  }

  return project;
}

/**
 * Save sound files to `<project-root>/android/app/src/main/res/raw`.
 */
function setNotificationSoundsAndroid(projectRoot, sounds) {
  assertSoundList(sounds);
  for (const sound of sounds) {
    writeNotificationSoundFile(sound, projectRoot);
  }
}

/**
 * Copies one sound to `<project-root>/android/app/src/main/res/raw` under its native file name.
 */
function writeNotificationSoundFile(sound, projectRoot) {
  const rawResourcesPath = resolve(projectRoot, ANDROID_RES_PATH, 'raw');
  const fileName = basename(sound.fileName);
  if (!fileName) {
    return;
  }
  try {
    const sourceFilepath = resolve(projectRoot, sound.source);
    const destinationFilepath = resolve(rawResourcesPath, fileName);
    if (!existsSync(rawResourcesPath)) {
      mkdirSync(rawResourcesPath, { recursive: true });
    }
    copyFileSync(sourceFilepath, destinationFilepath);
  } catch (e) {
    throw new Error(ERROR_MSG_PREFIX + 'Encountered an issue copying Android notification sounds: ' + e);
  }
}

const withNotificationSoundsIOS = (config, { sounds }) => {
  return withXcodeProject(config, (config) => {
    config.modResults = setNotificationSoundsIOS(config.modRequest.projectRoot, {
      sounds,
      project: config.modResults,
      projectName: config.modRequest.projectName,
    });
    return config;
  });
};

const withNotificationSoundsAndroid = (config, { sounds }) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      setNotificationSoundsAndroid(config.modRequest.projectRoot, sounds);
      return config;
    },
  ]);
};

/**
 * Copies the app's sound set (`{ soundSet }`, default `shared`) and the custom tones into the native iOS and Android
 * projects (plus the iOS aliases for the server sound names Core may send).
 */
const withNotificationSounds = (config, { soundSet = 'shared' } = {}) => {
  config = withNotificationSoundsIOS(config, { sounds: getIosSoundFiles(soundSet) });
  config = withNotificationSoundsAndroid(config, { sounds: getAndroidSoundFiles(soundSet) });

  return config;
};

module.exports = withNotificationSounds;
module.exports.MODERN_SOUNDS = MODERN_SOUNDS;
module.exports.DESK_SOUNDS = DESK_SOUNDS;
module.exports.CUSTOM_TONE_COUNT = CUSTOM_TONE_COUNT;
module.exports.SOUND_SETS = SOUND_SETS;
module.exports.IOS_SERVER_SOUND_ALIASES = IOS_SERVER_SOUND_ALIASES;
module.exports.IOS_DESK_SOUND_ALIASES = IOS_DESK_SOUND_ALIASES;
module.exports.getSoundFiles = getSoundFiles;
module.exports.getIosSoundFiles = getIosSoundFiles;
module.exports.getAndroidSoundFiles = getAndroidSoundFiles;
module.exports.setNotificationSoundsIOS = setNotificationSoundsIOS;
module.exports.setNotificationSoundsAndroid = setNotificationSoundsAndroid;
