// Ported from Unit services/__tests__/bluetooth-audio-b01inrico, -aina, -service-data, -uuid-normalization tests.
import { base64Encode } from '../../util/bytes';
import {
  AINA_HEADSET_SERVICE,
  AINA_HEADSET_SVC_PROP,
  areUuidsEqual,
  B01INRICO_HEADSET_SERVICE,
  B01INRICO_HEADSET_SERVICE_CHAR,
  getDeviceType,
  hasAudioServiceData,
  HYS_HEADSET_SERVICE,
  HYS_HEADSET_SERVICE_CHAR,
  isAudioDevice,
  normalizeUuid,
  parseAinaButtonData,
  parseB01InricoButtonData,
  parseGenericButtonData,
  parseHexButtonData,
  parseHysButtonData,
  routeCharacteristic,
  supportsMicrophoneControl,
} from '../device-profiles';

const now = 42;

describe('B01 Inrico button parsing', () => {
  it.each([
    [[0x01], 'ptt_start'],
    [[0x00], 'ptt_stop'],
    [[0x02], 'mute'],
    [[0x03], 'volume_up'],
    [[0x04], 'volume_down'],
    [[0x10], 'ptt_start'],
    [[0x11], 'ptt_stop'],
    [[0x20], 'mute'],
    [[0x05], 'unknown'],
    [[0x77], 'unknown'],
  ])('parses %j as %s', (bytes, button) => {
    expect(parseB01InricoButtonData(bytes, now)).toEqual({ type: 'press', button, timestamp: now });
  });

  it('detects long and double presses from the second byte', () => {
    expect(parseB01InricoButtonData([0x01, 0x01], now)?.type).toBe('long_press');
    expect(parseB01InricoButtonData([0x01, 0xff], now)?.type).toBe('long_press');
    expect(parseB01InricoButtonData([0x01, 0x02], now)?.type).toBe('double_press');
  });

  it('detects long press via the 0x80 flag and maps the masked button', () => {
    expect(parseB01InricoButtonData([0x81], now)).toEqual({ type: 'long_press', button: 'ptt_start', timestamp: now });
    expect(parseB01InricoButtonData([0x82], now)?.button).toBe('mute');
  });

  it('ignores a long press on PTT stop (0x80 is sent while PTT is held)', () => {
    expect(parseB01InricoButtonData([0x80], now)).toEqual({ type: 'long_press', button: 'unknown', timestamp: now });
  });

  it('parses the 0x2B frame family by byte 5 (P = press, R = release)', () => {
    expect(parseHexButtonData('inrico', '2b 00 00 00 00 50')?.button).toBe('ptt_start');
    expect(parseHexButtonData('inrico', '2b 00 00 00 00 52')?.button).toBe('ptt_stop');
    expect(parseHexButtonData('inrico', '2b')?.button).toBe('unknown');
  });

  it('returns null for an empty frame', () => {
    expect(parseB01InricoButtonData([], now)).toBeNull();
  });
});

describe('Aina button parsing', () => {
  it.each([
    [[0x00], 'ptt_stop'],
    [[0x01], 'ptt_start'],
    [[0x02], 'mute'],
    [[0x03], 'volume_up'],
    [[0x04], 'volume_down'],
    [[0x07], 'unknown'],
  ])('parses %j as %s', (bytes, button) => {
    expect(parseAinaButtonData(bytes, now)?.button).toBe(button);
  });

  it('flags 0xFF in byte 1 as a long press', () => {
    expect(parseAinaButtonData([0x01, 0xff], now)?.type).toBe('long_press');
    expect(parseAinaButtonData([0x01, 0x01], now)?.type).toBe('press');
  });
});

describe('HYS button parsing', () => {
  it.each([
    [[0x01], 'ptt_start'],
    [[0x00], 'ptt_stop'],
    [[0x02], 'mute'],
    [[0x05], 'unknown'],
  ])('parses %j as %s', (bytes, button) => {
    expect(parseHysButtonData(bytes, now)?.button).toBe(button);
  });

  it('reads long (0x01) and double (0x02) presses from byte 1', () => {
    expect(parseHysButtonData([0x01, 0x01], now)?.type).toBe('long_press');
    expect(parseHysButtonData([0x01, 0x02], now)?.type).toBe('double_press');
  });
});

describe('generic button parsing', () => {
  it('uses the low nibble for the button and high bits for long/double press', () => {
    expect(parseGenericButtonData([0x00], now)?.button).toBe('ptt_start');
    expect(parseGenericButtonData([0x01], now)?.button).toBe('ptt_stop');
    expect(parseGenericButtonData([0x04], now)?.button).toBe('mute');
    expect(parseGenericButtonData([0x80], now)?.type).toBe('long_press');
    expect(parseGenericButtonData([0x40], now)?.type).toBe('double_press');
  });
});

describe('characteristic routing', () => {
  const none = { hasVendorButtonCharacteristic: false, isSpecializedDevice: false };

  it('routes each vendor characteristic to its family, in short or long UUID form', () => {
    expect(routeCharacteristic(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, none)).toBe('aina');
    expect(routeCharacteristic('6666', '8888', none)).toBe('inrico');
    expect(routeCharacteristic(B01INRICO_HEADSET_SERVICE.toLowerCase(), B01INRICO_HEADSET_SERVICE_CHAR, none)).toBe('inrico');
    expect(routeCharacteristic(HYS_HEADSET_SERVICE, HYS_HEADSET_SERVICE_CHAR, none)).toBe('hys');
  });

  it('never parses battery level or HID characteristics as buttons (battery 100% read as mute)', () => {
    expect(routeCharacteristic('180F', '2A19', { hasVendorButtonCharacteristic: false, isSpecializedDevice: true })).toBeNull();
    expect(routeCharacteristic('1812', '2A4D', { hasVendorButtonCharacteristic: false, isSpecializedDevice: true })).toBeNull();
  });

  it('ignores other characteristics (the Aina counter) while a vendor button characteristic is active', () => {
    expect(routeCharacteristic(AINA_HEADSET_SERVICE, '127FC0FF-CB21-11E5-93D0-0002A5D5C51B', { hasVendorButtonCharacteristic: true, isSpecializedDevice: true })).toBeNull();
  });

  it('falls back to the generic parser for button-control and likely characteristics on specialized devices', () => {
    expect(routeCharacteristic('1234', 'FE59', none)).toBe('generic');
    expect(routeCharacteristic('FFE0', 'FFE1', { hasVendorButtonCharacteristic: false, isSpecializedDevice: true })).toBe('generic');
    expect(routeCharacteristic('FFE0', 'FFE1', none)).toBeNull();
  });
});

describe('UUID normalization', () => {
  it('expands 16/32-bit UUIDs with the Bluetooth base UUID and ignores case and dashes', () => {
    expect(normalizeUuid('110a')).toBe('0000110A-0000-1000-8000-00805F9B34FB');
    expect(normalizeUuid('0000110A')).toBe('0000110A-0000-1000-8000-00805F9B34FB');
    expect(normalizeUuid('0000110a00001000800000805f9b34fb')).toBe('0000110A-0000-1000-8000-00805F9B34FB');
    expect(areUuidsEqual('111E', '0000111e-0000-1000-8000-00805f9b34fb')).toBe(true);
    expect(areUuidsEqual('', '111E')).toBe(false);
  });
});

describe('device detection', () => {
  it('detects audio devices by name, service UUIDs, manufacturer data or service data', () => {
    expect(isAudioDevice({ id: '1', name: 'AINA PTT Voice Responder' })).toBe(true);
    expect(isAudioDevice({ id: '2', name: 'Thing', advertising: { serviceUUIDs: ['111E'] } })).toBe(true);
    expect(isAudioDevice({ id: '3', name: 'Thing', advertising: { manufacturerData: { '004C': 'abcd' } } })).toBe(true);
    expect(isAudioDevice({ id: '4', name: 'Thing', advertising: { serviceData: { '0000110A-0000-1000-8000-00805F9B34FB': '00' } } })).toBe(true);
    expect(isAudioDevice({ id: '5', name: 'Thermostat', advertising: { serviceUUIDs: ['181A'] } })).toBe(false);
  });

  it('reads class-of-device bytes from hex or base64 service data', () => {
    expect(hasAudioServiceData('200404')).toBe(true); // major class 0x04 (audio/video)
    expect(hasAudioServiceData(base64Encode([0x20, 0x04, 0x04]))).toBe(true);
    expect(hasAudioServiceData({ '181A': 'ffff' })).toBe(false);
  });

  it('classifies specialized PTT handsets and microphone control', () => {
    expect(getDeviceType({ id: '1', advertising: { serviceUUIDs: [AINA_HEADSET_SERVICE] } })).toBe('specialized');
    expect(getDeviceType({ id: '2', name: 'HYS-PTT' })).toBe('specialized');
    expect(getDeviceType({ id: '3', name: 'AirPods' })).toBe('system');
    expect(supportsMicrophoneControl({ id: '1', advertising: { serviceUUIDs: ['111E'] } })).toBe(true);
    expect(supportsMicrophoneControl({ id: '1', advertising: { serviceUUIDs: ['110A'] } })).toBe(false);
  });
});
