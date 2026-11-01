// Channel set (D17 + §10.2a): every Android channel id Core can send exists, each with a modern sound (or the custom
// tone) for its meaning; the four iOS categories are built. Core's sound types are read from a verbatim copy of
// PushSoundTypes.cs, so a new server sound type fails here until Omni creates its channel.
import * as fs from 'fs';
import * as path from 'path';

import { ANDROID_CHANNEL_IDS, ANDROID_CHANNELS, buildIosCategories, CHECK_IN_ACTION_ID, IOS_CATEGORY_IDS } from '../channels';
import { CUSTOM_TONE_COUNT, IOS_SERVER_SOUND_ALIASES, isCustomTone, isModernSound, MODERN_SOUNDS, PUSH_SOUND_TYPE_SOUNDS, PUSH_SOUND_TYPES, soundForSoundType } from '../sounds';
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
};

const audioDir = path.join(REPO_ROOT, 'apps', 'omni', 'assets', 'audio');

describe('Core sound types', () => {
  it('reads the fixture', () => {
    expect(coreSoundTypes.length).toBeGreaterThanOrEqual(27);
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
  const expectedIds = ['calls', ...coreSoundTypes.map(({ value }) => String(value)), ...Array.from({ length: 25 }, (_, i) => `c${i + 1}`), 'notif', 'message'];

  it('equals Core sound types + calls + c1–c25 + notif + message', () => {
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
    for (const id of ['calls', '0', '3', '7', '10', '14', '16', '23', '24', 'c1', 'c25']) expect(byId.get(id)?.vibration).toBe(true);
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

  it.each(['c0', 'c26', 'c01', 'calls1', '27', '-1', '07', 'callemergency', ''])('knows no sound for %p', (type) => {
    expect(soundForSoundType(type)).toBeNull();
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
