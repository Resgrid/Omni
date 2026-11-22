// Channel set (D17 + §10.2a): every Android channel id Core can send exists, each with a modern sound (or the custom
// tone) for its meaning; the four iOS categories are built. Core's sound types are read from a verbatim copy of
// PushSoundTypes.cs, so a new server sound type fails here until Omni creates its channel. The dispatcher desk types
// (28–32, Dispatch only) have their own channels, created only by an app whose sound set has the desk sounds.
import * as fs from 'fs';
import * as path from 'path';

import { ANDROID_CHANNEL_IDS, ANDROID_CHANNELS, androidChannelsFor, buildIosCategories, CHECK_IN_ACTION_ID, DESK_ANDROID_CHANNELS, IOS_CATEGORY_IDS, STATUS_TIMER_CATEGORY_ID, STATUS_TIMER_CHANNEL } from '../channels';
import {
  CUSTOM_TONE_COUNT,
  DESK_EVENT_SOUNDS,
  DESK_PUSH_SOUND_TYPES,
  DESK_SOUND_FALLBACKS,
  DESK_SOUNDS,
  IOS_DESK_SOUND_ALIASES,
  IOS_SERVER_SOUND_ALIASES,
  isCustomTone,
  isDeskSound,
  isModernSound,
  MODERN_SOUNDS,
  PUSH_SOUND_TYPE_SOUNDS,
  PUSH_SOUND_TYPES,
  soundForDeskEvent,
  soundForSet,
  soundForSoundType,
  soundSetSounds,
} from '../sounds';
import { REPO_ROOT } from './helpers';

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'PushSoundTypes.cs'), 'utf8');
const enumBody = /enum\s+PushSoundTypes\s*\{([\s\S]*?)\}/.exec(fixture)?.[1] ?? '';
const coreSoundTypes = [...enumBody.matchAll(/(\w+)\s*=\s*(\d+)/g)].map((match) => ({ name: match[1], value: Number(match[2]) }));

/** The documented mapping (sounds.ts table), asserted value by value. */
const EXPECTED_SOUND_BY_TYPE: Record<number, string> = {
  0: 'moderncallemergency',
  1: 'moderncallhigh',
  2: 'moderncallmedium',
  3: 'moderncalllow',
  4: 'modernnotification',
  5: 'modernmessage',
  6: 'modernnotification',
  7: 'moderncallemergency',
  8: 'moderncallhigh',
  9: 'moderncallmedium',
  10: 'moderncalllow',
  11: 'modernnotification',
  12: 'modernmessage',
  13: 'modernchat',
  14: 'moderncallupdated',
  15: 'moderncallclosed',
  16: 'moderntroublealert',
  17: 'modernpersonnelstatus',
  18: 'modernunitstatus',
  19: 'modernstaffing',
  20: 'modernshift',
  21: 'moderntraining',
  22: 'moderncalendar',
  23: 'modernavailabilityalert',
  24: 'modernweatheralert',
  25: 'modernunitnotice',
  26: 'modernresourceorder',
  27: 'moderncallrenotify',
  28: 'moderndeskoffer',
  29: 'moderndeskqueuealert',
  30: 'moderndeskmessage',
  31: 'modernbreakreminder',
  32: 'modernbreakover',
};

const audioDir = path.join(REPO_ROOT, 'apps', 'omni', 'assets', 'audio');
const dispatchAudioDir = path.join(REPO_ROOT, 'apps', 'omni', 'variants', 'dispatch', 'assets', 'audio');
const DESK_TYPES = new Set<number>([28, 29, 30, 31, 32]);

describe('Core sound types', () => {
  it('reads the fixture', () => {
    expect(coreSoundTypes.length).toBeGreaterThanOrEqual(33);
    expect(coreSoundTypes[0]).toEqual({ name: 'CallEmergency', value: 0 });
  });

  it('mirrors PushSoundTypes exactly', () => {
    expect(Object.entries(PUSH_SOUND_TYPES).map(([name, value]) => ({ name, value }))).toEqual(coreSoundTypes);
  });

  it('maps every Core sound type to the documented modern sound', () => {
    for (const { value } of coreSoundTypes) {
      expect(PUSH_SOUND_TYPE_SOUNDS[value as keyof typeof PUSH_SOUND_TYPE_SOUNDS]).toBe(EXPECTED_SOUND_BY_TYPE[value]);
      expect(soundForSoundType(String(value))).toBe(EXPECTED_SOUND_BY_TYPE[value]);
      expect(soundForSoundType(value)).toBe(EXPECTED_SOUND_BY_TYPE[value]);
    }
  });
});

describe('Android channels', () => {
  const expectedIds = ['calls', ...coreSoundTypes.flatMap(({ value }) => (DESK_TYPES.has(value) ? [] : [String(value)])), ...Array.from({ length: 25 }, (_, i) => `c${i + 1}`), 'notif', 'message'];

  it('equals Core sound types (the desk types aside) + calls + c1–c25 + notif + message', () => {
    expect([...ANDROID_CHANNEL_IDS].sort()).toEqual([...expectedIds].sort());
    expect(new Set(ANDROID_CHANNEL_IDS).size).toBe(ANDROID_CHANNEL_IDS.length);
  });

  it('includes the ids the legacy apps never created (§10.2a)', () => {
    for (const id of ['4', '5', '6', '7', '13', '24', '26']) {
      expect(ANDROID_CHANNEL_IDS).toContain(id);
    }
  });

  it('gives every channel a modern sound or its own custom tone, and the file exists', () => {
    for (const channel of ANDROID_CHANNELS) {
      if (channel.id.startsWith('c') && channel.id !== 'calls') {
        expect(channel.sound).toBe(channel.id);
        expect(isCustomTone(channel.sound)).toBe(true);
        expect(fs.existsSync(path.join(audioDir, 'custom', `${channel.sound}.wav`))).toBe(true);
      } else {
        expect(isModernSound(channel.sound)).toBe(true);
        expect(fs.existsSync(path.join(audioDir, `${channel.sound}.wav`))).toBe(true);
      }

      expect(soundForSoundType(channel.id)).toBe(channel.sound);
    }
  });

  it('never uses a classic sound', () => {
    for (const channel of ANDROID_CHANNELS) {
      expect(channel.sound).toMatch(/^(modern[a-z]+|c\d+)$/);
    }
  });

  it('keeps the extra channels on their documented sounds', () => {
    const byId = new Map(ANDROID_CHANNELS.map((channel) => [channel.id, channel]));
    expect(byId.get('calls')?.sound).toBe('modernnotification');
    expect(byId.get('notif')?.sound).toBe('modernnotification');
    expect(byId.get('message')?.sound).toBe('modernmessage');
  });

  it('vibrates for calls, alerts and custom tones only', () => {
    const byId = new Map(ANDROID_CHANNELS.map((channel) => [channel.id, channel]));

    for (const id of ['calls', '0', '3', '7', '10', '14', '16', '23', '24', '27', 'c1', 'c25']) expect(byId.get(id)?.vibration).toBe(true);

    for (const id of ['4', '5', '11', '12', '13', '17', 'notif', 'message']) expect(byId.get(id)?.vibration).toBe(false);
  });

  it('names every channel through a translation key with an English fallback, distinct per id', () => {
    const names = ANDROID_CHANNELS.map((channel) => channel.defaultName.replace('{{number}}', String(channel.nameParams?.number ?? '')));
    expect(new Set(names).size).toBe(names.length);

    for (const channel of ANDROID_CHANNELS) {
      expect(channel.nameKey).toMatch(/^push_notifications\.channels\.[a-z_]+$/);
    }
  });
});

describe('modern sound set', () => {
  it('lists exactly the modern files in apps/omni/assets/audio', () => {
    const files = fs
      .readdirSync(audioDir)
      .filter((file) => file.endsWith('.wav'))
      .map((file) => file.replace(/\.wav$/, ''))
      .sort();

    expect([...MODERN_SOUNDS].sort()).toEqual(files);
  });

  it('has 25 custom tones on disk', () => {
    expect(CUSTOM_TONE_COUNT).toBe(25);

    for (let tone = 1; tone <= 25; tone++) {
      expect(fs.existsSync(path.join(audioDir, 'custom', `c${tone}.wav`))).toBe(true);
    }
  });

  it('aliases every classic iOS server sound name to a modern sound', () => {
    expect(Object.keys(IOS_SERVER_SOUND_ALIASES).sort()).toEqual(['6', 'callemergency', 'callhigh', 'calllow', 'callmedium', 'message', 'notification']);

    for (const sound of Object.values(IOS_SERVER_SOUND_ALIASES)) {
      expect(isModernSound(sound)).toBe(true);
    }
  });

  it.each(['c0', 'c26', 'c01', 'calls1', '33', '-1', '07', '028', 'callemergency', 'moderndeskoffer', ''])('knows no sound for %p', (type) => {
    expect(soundForSoundType(type)).toBeNull();
  });
});

// The sound file's level, length and repeats are checked in sound-files.test.ts.
describe('dispatch re-notification sound (ModernCallRenotify, 27)', () => {
  it('has its own call channel, named Call Reminder, that vibrates', () => {
    const channel = ANDROID_CHANNELS.find((spec) => spec.id === '27');
    expect(channel).toMatchObject({ sound: 'moderncallrenotify', kind: 'call', vibration: true, nameKey: 'push_notifications.channels.call_renotify', defaultName: 'Call Reminder' });
  });
});

describe('dispatcher desk sounds (Core types 28–32, Dispatch only)', () => {
  it('are the desk sound types, each with its own desk sound', () => {
    expect([...DESK_PUSH_SOUND_TYPES]).toEqual([28, 29, 30, 31, 32]);
    expect(DESK_PUSH_SOUND_TYPES.map((type) => PUSH_SOUND_TYPE_SOUNDS[type]).sort()).toEqual([...DESK_SOUNDS].sort());

    for (const sound of DESK_SOUNDS) {
      expect(isDeskSound(sound)).toBe(true);
      expect(isModernSound(sound)).toBe(false);
    }
  });

  it('have a channel each, with the desk sound, a translated name and the documented kind', () => {
    expect(DESK_ANDROID_CHANNELS.map((channel) => channel.id)).toEqual(['28', '29', '30', '31', '32']);

    for (const channel of DESK_ANDROID_CHANNELS) {
      expect(isDeskSound(channel.sound)).toBe(true);
      expect(soundForSoundType(channel.id)).toBe(channel.sound);
      expect(channel.nameKey).toMatch(/^push_notifications\.channels\.[a-z_]+$/);
      expect(fs.existsSync(path.join(dispatchAudioDir, `${channel.sound}.wav`))).toBe(true);
      expect(fs.existsSync(path.join(audioDir, `${channel.sound}.wav`))).toBe(false);
    }

    const byId = new Map(DESK_ANDROID_CHANNELS.map((channel) => [channel.id, channel]));

    expect(byId.get('28')).toMatchObject({ defaultName: 'Desk Offer', kind: 'alert', vibration: true });
    expect(byId.get('29')).toMatchObject({ defaultName: 'Desk Queue Alert', kind: 'alert', vibration: true });
    expect(byId.get('30')).toMatchObject({ defaultName: 'Desk Message', kind: 'message', vibration: false });
    expect(byId.get('31')).toMatchObject({ defaultName: 'Break Reminder', kind: 'notification', vibration: false });
    expect(byId.get('32')).toMatchObject({ defaultName: 'Break Over', kind: 'alert', vibration: true });
  });

  it('are created only by an app whose sound set has them', () => {
    const ids = (deskSounds: boolean, statusTimer: boolean) => androidChannelsFor({ deskSounds, statusTimer }).map((channel) => channel.id);

    expect(ids(false, false)).toEqual([...ANDROID_CHANNEL_IDS]);
    expect(ids(true, false)).toEqual([...ANDROID_CHANNEL_IDS, '28', '29', '30', '31', '32']);
    expect(ids(false, true)).toEqual([...ANDROID_CHANNEL_IDS, STATUS_TIMER_CHANNEL.id]);
    expect(new Set(ids(true, true)).size).toBe(ids(true, true).length);
  });

  it('fall back to the shared sound of the same meaning in an app without them', () => {
    expect(DESK_SOUND_FALLBACKS).toEqual({
      moderndeskoffer: 'modernnotification',
      moderndeskqueuealert: 'modernnotification',
      moderndeskmessage: 'modernmessage',
      modernbreakreminder: 'modernnotification',
      modernbreakover: 'modernnotification',
    });

    for (const sound of DESK_SOUNDS) {
      expect(soundForSet(sound, 'dispatch')).toBe(sound);
      expect(isModernSound(soundForSet(sound, 'shared'))).toBe(true);
    }

    expect(soundForSet('moderncallemergency', 'shared')).toBe('moderncallemergency');
    expect(soundForSet('c7', 'dispatch')).toBe('c7');
  });

  it('name the files each sound set ships', () => {
    expect(soundSetSounds('shared')).toEqual(MODERN_SOUNDS);
    expect(soundSetSounds('dispatch')).toEqual([...MODERN_SOUNDS, ...DESK_SOUNDS]);
  });

  it('give every in-app desk event the sound of its push type', () => {
    expect(DESK_EVENT_SOUNDS).toEqual({
      offer: PUSH_SOUND_TYPE_SOUNDS[28],
      queueAlert: PUSH_SOUND_TYPE_SOUNDS[29],
      message: PUSH_SOUND_TYPE_SOUNDS[30],
      breakReminder: PUSH_SOUND_TYPE_SOUNDS[31],
      breakOver: PUSH_SOUND_TYPE_SOUNDS[32],
    });
    expect(soundForDeskEvent('offer')).toBe('moderndeskoffer');
    expect(soundForDeskEvent('breakOver')).toBe('modernbreakover');
  });

  it('are also bundled on iOS under the {type}.wav name Core falls back to', () => {
    expect(IOS_DESK_SOUND_ALIASES).toEqual({ '28': 'moderndeskoffer', '29': 'moderndeskqueuealert', '30': 'moderndeskmessage', '31': 'modernbreakreminder', '32': 'modernbreakover' });
  });
});

describe('iOS categories', () => {
  const translate = (_key: string, fallback: string) => fallback;

  it('registers calls, messages, notifications and chats', () => {
    expect(buildIosCategories({ checkInActions: false, translate }).map((category) => category.id)).toEqual([...IOS_CATEGORY_IDS]);
    expect([...IOS_CATEGORY_IDS]).toEqual(['calls', 'messages', 'notifications', 'chats']);
  });

  it('adds the check-in action to calls only when the variant has check-in actions', () => {
    const without = buildIosCategories({ checkInActions: false, translate });
    expect(without[0].actions?.map((action) => action.id)).toEqual(['view']);
    const withCheckIn = buildIosCategories({ checkInActions: true, translate });
    expect(withCheckIn[0].actions?.map((action) => action.id)).toEqual(['view', CHECK_IN_ACTION_ID]);
    expect(withCheckIn.slice(1).every((category) => !category.actions)).toBe(true);
  });
});

describe('status timer channel and category (scheduled by the app, never sent by Core)', () => {
  const translate = (_key: string, fallback: string) => fallback;

  it('is a separate channel with a modern sound that exists on disk, and vibrates', () => {
    expect(ANDROID_CHANNEL_IDS).not.toContain(STATUS_TIMER_CHANNEL.id);
    expect(isModernSound(STATUS_TIMER_CHANNEL.sound)).toBe(true);
    expect(fs.existsSync(path.join(audioDir, `${STATUS_TIMER_CHANNEL.sound}.wav`))).toBe(true);
    expect(STATUS_TIMER_CHANNEL).toMatchObject({ id: 'unit-status-timer', nameKey: 'push_notifications.channels.unit_status_timer', vibration: true });
  });

  it('adds its category, with an Update Status action that opens the app, only when asked', () => {
    expect(buildIosCategories({ checkInActions: true, translate }).map((category) => category.id)).not.toContain(STATUS_TIMER_CATEGORY_ID);
    const categories = buildIosCategories({ checkInActions: false, statusTimer: true, translate });
    expect(categories.map((category) => category.id)).toEqual([...IOS_CATEGORY_IDS, STATUS_TIMER_CATEGORY_ID]);
    expect(categories[4].actions).toEqual([{ id: 'view', title: 'Update status', foreground: true }]);
  });
});
