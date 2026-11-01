const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { basename, resolve } = require('path');

// Notification sounds for the native projects (omni-plan D17, §7.6, §10.2a): the MODERN sound set and the department
// custom tones only. There are no classic sound files and no modern/classic toggle.
//
// - Android: every sound goes to res/raw under its own name. The app creates one channel per id Core can send
//   (`calls`, "0"–"26", c1–c25, `notif`, `message`) and gives each the modern sound for its meaning
//   (@resgrid/notifications `ANDROID_CHANNELS`), so the channel — not the payload — decides what plays.
// - iOS: the APNs payload names the file to play. Modern types (7+) and custom tones name their own file; classic
//   types (0–6) name their historical file (NovuProvider.GetSoundFileNameFromType). So the modern sound of the same
//   meaning is also bundled under each of those names (`IOS_SERVER_SOUND_ALIASES`), and a department still on classic
//   server settings hears modern sounds on iOS too. Aliases are iOS-only: Android channels set their own sound, and
//   `6` is not a valid Android resource name.
//
// Keep MODERN_SOUNDS, CUSTOM_TONE_COUNT and IOS_SERVER_SOUND_ALIASES identical to packages/notifications/src/sounds.ts
// (the plugin test compares them).

const ERROR_MSG_PREFIX = 'An error occurred while configuring notification sounds. ';
const ANDROID_RES_PATH = 'android/app/src/main/res/';
const AUDIO_DIR = 'assets/audio';

const MODERN_SOUNDS = [
  'modernavailabilityalert',
  'moderncalendar',
  'moderncallclosed',
  'moderncallemergency',
  'moderncallhigh',
  'moderncalllow',
  'moderncallmedium',
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

const CUSTOM_TONE_COUNT = 25;

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

/** @typedef {{ source: string, fileName: string }} SoundFile  source relative to the project root; fileName in the native project */

/** @returns {SoundFile[]} the modern sounds and custom tones under their own names (both platforms). */
function getSoundFiles() {
  const modern = MODERN_SOUNDS.map((stem) => ({ source: `${AUDIO_DIR}/${stem}.wav`, fileName: `${stem}.wav` }));
  const custom = Array.from({ length: CUSTOM_TONE_COUNT }, (_, index) => ({ source: `${AUDIO_DIR}/custom/c${index + 1}.wav`, fileName: `c${index + 1}.wav` }));
  return [...modern, ...custom];
}

/** @returns {SoundFile[]} what iOS bundles: every sound file plus the modern sound under each classic server name. */
function getIosSoundFiles() {
  const aliases = Object.entries(IOS_SERVER_SOUND_ALIASES).map(([serverName, stem]) => ({ source: `${AUDIO_DIR}/${stem}.wav`, fileName: `${serverName}.wav` }));
  return [...getSoundFiles(), ...aliases];
}

/** @returns {SoundFile[]} what Android bundles in res/raw. */
function getAndroidSoundFiles() {
  return getSoundFiles();
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
 * Copies the modern notification sounds and custom tones into the native iOS and Android projects (plus the iOS
 * aliases for classic server sound names).
 */
const withNotificationSounds = (config) => {
  config = withNotificationSoundsIOS(config, { sounds: getIosSoundFiles() });
  config = withNotificationSoundsAndroid(config, { sounds: getAndroidSoundFiles() });
  return config;
};

module.exports = withNotificationSounds;
module.exports.MODERN_SOUNDS = MODERN_SOUNDS;
module.exports.CUSTOM_TONE_COUNT = CUSTOM_TONE_COUNT;
module.exports.IOS_SERVER_SOUND_ALIASES = IOS_SERVER_SOUND_ALIASES;
module.exports.getSoundFiles = getSoundFiles;
module.exports.getIosSoundFiles = getIosSoundFiles;
module.exports.getAndroidSoundFiles = getAndroidSoundFiles;
module.exports.setNotificationSoundsIOS = setNotificationSoundsIOS;
module.exports.setNotificationSoundsAndroid = setNotificationSoundsAndroid;
