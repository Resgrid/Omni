import { asciiDecode, base64Decode, type ByteSource, hexDecode, hexEncode, toBytes } from '../util/bytes';
import type { AudioButton, AudioButtonEvent, BlePeripheral, BluetoothDeviceType } from './types';

/**
 * Device knowledge for Bluetooth PTT handsets (Unit bluetooth-audio.service): service/characteristic UUIDs, button
 * frame parsers for Aina, B01 Inrico and HYS (plus a generic fallback), characteristic routing, and audio-device
 * detection from advertising data. Pure functions: the native (BLE manager) and web (Web Bluetooth) services share them.
 */

export const AUDIO_SERVICE_UUID = '0000110A-0000-1000-8000-00805F9B34FB'; // A2DP
export const HFP_SERVICE_UUID = '0000111E-0000-1000-8000-00805F9B34FB'; // Hands-Free Profile
export const HSP_SERVICE_UUID = '00001108-0000-1000-8000-00805F9B34FB'; // Headset Profile

export const AINA_HEADSET_SERVICE = '127FACE1-CB21-11E5-93D0-0002A5D5C51B';
export const AINA_HEADSET_SVC_PROP = '127FBEEF-CB21-11E5-93D0-0002A5D5C51B';
export const B01INRICO_HEADSET_SERVICE = '00006666-0000-1000-8000-00805F9B34FB';
export const B01INRICO_HEADSET_SERVICE_CHAR = '00008888-0000-1000-8000-00805F9B34FB';
export const HYS_HEADSET_SERVICE = '0000FFE0-0000-1000-8000-00805F9B34FB';
export const HYS_HEADSET_SERVICE_CHAR = '00002902-0000-1000-8000-00805F9B34FB';

/** Common vendor button-control characteristic. */
export const BUTTON_CONTROL_CHARACTERISTICS = ['0000FE59-0000-1000-8000-00805F9B34FB'];

/**
 * Standard GATT characteristics never fed to a button parser: their payloads are telemetry. Battery 100% (0x64) decodes
 * as generic 'mute' and toggled the microphone mid-transmission (Unit fix).
 */
export const EXCLUDED_STANDARD_CHARACTERISTICS = [
  '00002A19-0000-1000-8000-00805F9B34FB', // Battery Level
  '00002A4A-0000-1000-8000-00805F9B34FB', // HID Information
  '00002A4B-0000-1000-8000-00805F9B34FB', // HID Report Map
  '00002A4C-0000-1000-8000-00805F9B34FB', // HID Control Point
  '00002A4D-0000-1000-8000-00805F9B34FB', // HID Report
];

export type DeviceFamily = 'aina' | 'inrico' | 'hys' | 'generic';

/** The vendor button characteristic for each specialized family (subscribed first after connect). */
export const VENDOR_BUTTON_CHARACTERISTICS: readonly { family: Exclude<DeviceFamily, 'generic'>; service: string; characteristic: string }[] = [
  { family: 'aina', service: AINA_HEADSET_SERVICE, characteristic: AINA_HEADSET_SVC_PROP },
  { family: 'inrico', service: B01INRICO_HEADSET_SERVICE, characteristic: B01INRICO_HEADSET_SERVICE_CHAR },
  { family: 'hys', service: HYS_HEADSET_SERVICE, characteristic: HYS_HEADSET_SERVICE_CHAR },
];

const SPECIALIZED_SERVICES = [AINA_HEADSET_SERVICE, B01INRICO_HEADSET_SERVICE, HYS_HEADSET_SERVICE];
const AUDIO_SERVICES = [AUDIO_SERVICE_UUID, HFP_SERVICE_UUID, HSP_SERVICE_UUID, ...SPECIALIZED_SERVICES];
const AUDIO_KEYWORDS = ['speaker', 'headset', 'earbuds', 'headphone', 'audio', 'mic', 'sound', 'wireless', 'bluetooth', 'bt', 'aina', 'inrico', 'hys', 'b01', 'ptt'];

/** 16/32/128-bit UUID → uppercase 128-bit form using the Bluetooth base UUID. */
export const normalizeUuid = (uuid: string): string => {
  const clean = uuid.replace(/[-\s]/g, '').toUpperCase();
  if (clean.length === 4) return `0000${clean}-0000-1000-8000-00805F9B34FB`;
  if (clean.length === 8) return `${clean}-0000-1000-8000-00805F9B34FB`;
  if (clean.length === 32) return `${clean.substring(0, 8)}-${clean.substring(8, 12)}-${clean.substring(12, 16)}-${clean.substring(16, 20)}-${clean.substring(20)}`;
  return uuid.toUpperCase();
};

export const areUuidsEqual = (a: string | null | undefined, b: string | null | undefined): boolean => Boolean(a && b) && normalizeUuid(a as string) === normalizeUuid(b as string);

export const characteristicKey = (service: string, characteristic: string): string => `${normalizeUuid(service)}::${normalizeUuid(characteristic)}`;

export const isExcludedStandardCharacteristic = (characteristic: string): boolean => EXCLUDED_STANDARD_CHARACTERISTICS.some((uuid) => areUuidsEqual(characteristic, uuid));

export const isLikelyButtonCharacteristic = (service: string, characteristic: string): boolean => {
  if (SPECIALIZED_SERVICES.some((uuid) => areUuidsEqual(service, uuid))) return true;
  if ([AINA_HEADSET_SVC_PROP, B01INRICO_HEADSET_SERVICE_CHAR, HYS_HEADSET_SERVICE_CHAR, ...BUTTON_CONTROL_CHARACTERISTICS].some((uuid) => areUuidsEqual(characteristic, uuid))) return true;
  // HID is deliberately absent: its reports are not single-byte button frames.
  const s = service.replace(/-/g, '').toUpperCase();
  const c = characteristic.replace(/-/g, '').toUpperCase();
  return ['FFE0', 'FFE1', 'FFE2', '8888', 'BEEF', 'FE59'].some((fragment) => s.includes(fragment) || c.includes(fragment));
};

const event = (button: AudioButton, type: AudioButtonEvent['type'], now: number): AudioButtonEvent => ({ type, button, timestamp: now });

/** Aina: byte 0 = button, byte 1 = 0xFF on long press. */
export const parseAinaButtonData = (data: ByteSource, now: number = Date.now()): AudioButtonEvent | null => {
  const bytes = toBytes(data);
  if (bytes.length === 0) return null;
  const map: Record<number, AudioButton> = { 0x00: 'ptt_stop', 0x01: 'ptt_start', 0x02: 'mute', 0x03: 'volume_up', 0x04: 'volume_down' };
  return event(map[bytes[0] as number] ?? 'unknown', bytes.length > 1 && bytes[1] === 0xff ? 'long_press' : 'press', now);
};

const INRICO_MAP: Record<number, AudioButton> = {
  0x00: 'ptt_stop',
  0x01: 'ptt_start',
  0x02: 'mute',
  0x03: 'volume_up',
  0x04: 'volume_down',
  0x05: 'unknown', // emergency / special
  0x10: 'ptt_start',
  0x11: 'ptt_stop',
  0x20: 'mute',
  0x30: 'volume_up',
  0x40: 'volume_down',
};

/**
 * B01 Inrico: byte 0 = button (two code sets), 0x2B + byte 5 'P'/'R' (80/82) = PTT press/release frames, byte 1
 * 0x01/0xFF long press and 0x02 double press, bit 0x80 = long-press flag. 0x80 alone (long press on 0x00) is sent while
 * PTT is held and must not stop transmission.
 */
export const parseB01InricoButtonData = (data: ByteSource, now: number = Date.now()): AudioButtonEvent | null => {
  const bytes = toBytes(data);
  if (bytes.length === 0) return null;
  const byte = bytes[0] as number;
  const byte5 = bytes[5] ?? 0;
  let button: AudioButton = INRICO_MAP[byte] ?? 'unknown';
  let type: AudioButtonEvent['type'] = 'press';
  if (byte === 43) {
    button = byte5 === 80 ? 'ptt_start' : byte5 === 82 ? 'ptt_stop' : 'unknown';
  }
  if (bytes.length > 1) {
    const second = bytes[1];
    if (second === 0x01 || second === 0xff) type = 'long_press';
    else if (second === 0x02) type = 'double_press';
  }
  if ((byte & 0x80) === 0x80) {
    type = 'long_press';
    const actual = byte & 0x7f;
    button = actual === 0x00 ? 'unknown' : (INRICO_MAP[actual] ?? button);
  }
  return event(button, type, now);
};

/** HYS: byte 0 = button, byte 1 0x01 long / 0x02 double press. */
export const parseHysButtonData = (data: ByteSource, now: number = Date.now()): AudioButtonEvent | null => {
  const bytes = toBytes(data);
  if (bytes.length === 0) return null;
  const map: Record<number, AudioButton> = { 0x00: 'ptt_stop', 0x01: 'ptt_start', 0x02: 'mute', 0x03: 'volume_up', 0x04: 'volume_down', 0x05: 'unknown' };
  const type = bytes.length > 1 && bytes[1] === 0x01 ? 'long_press' : bytes.length > 1 && bytes[1] === 0x02 ? 'double_press' : 'press';
  return event(map[bytes[0] as number] ?? 'unknown', type, now);
};

/** Generic: low nibble = button, 0x80 long press, 0x40 double press. */
export const parseGenericButtonData = (data: ByteSource, now: number = Date.now()): AudioButtonEvent | null => {
  const bytes = toBytes(data);
  if (bytes.length === 0) return null;
  const byte = bytes[0] as number;
  const map: Record<number, AudioButton> = { 0x00: 'ptt_start', 0x01: 'ptt_stop', 0x02: 'volume_up', 0x03: 'volume_down', 0x04: 'mute' };
  const type = byte & 0x80 ? 'long_press' : byte & 0x40 ? 'double_press' : 'press';
  return event(map[byte & 0x0f] ?? 'unknown', type, now);
};

export const parseButtonData = (family: DeviceFamily, data: ByteSource, now: number = Date.now()): AudioButtonEvent | null => {
  switch (family) {
    case 'aina':
      return parseAinaButtonData(data, now);
    case 'inrico':
      return parseB01InricoButtonData(data, now);
    case 'hys':
      return parseHysButtonData(data, now);
    default:
      return parseGenericButtonData(data, now);
  }
};

/** Debug helper (B01 Inrico mapping tests): parse a hex string such as "2b 00 00 00 00 50". */
export const parseHexButtonData = (family: DeviceFamily, hex: string): AudioButtonEvent | null => {
  const bytes = hexDecode(hex);
  return bytes ? parseButtonData(family, bytes) : null;
};

export interface CharacteristicRoutingContext {
  /** A vendor button characteristic is subscribed: other characteristics (e.g. the Aina event counter) are ignored. */
  hasVendorButtonCharacteristic: boolean;
  /** The connected device is a specialized PTT handset. */
  isSpecializedDevice: boolean;
}

/** Which parser (if any) handles an update on this characteristic. */
export const routeCharacteristic = (service: string, characteristic: string, context: CharacteristicRoutingContext): DeviceFamily | null => {
  if (isExcludedStandardCharacteristic(characteristic)) return null;
  const vendor = VENDOR_BUTTON_CHARACTERISTICS.find((entry) => areUuidsEqual(service, entry.service) && areUuidsEqual(characteristic, entry.characteristic));
  if (vendor) return vendor.family;
  if (context.hasVendorButtonCharacteristic) return null;
  if (BUTTON_CONTROL_CHARACTERISTICS.some((uuid) => areUuidsEqual(characteristic, uuid))) return 'generic';
  if (context.isSpecializedDevice && isLikelyButtonCharacteristic(service, characteristic)) return 'generic';
  return null;
};

export const getDeviceType = (device: BlePeripheral): BluetoothDeviceType => {
  const uuids = device.advertising?.serviceUUIDs ?? [];
  if (uuids.some((uuid) => SPECIALIZED_SERVICES.some((s) => areUuidsEqual(uuid, s)))) return 'specialized';
  const name = (device.name ?? device.advertising?.localName ?? '').toLowerCase();
  return name.includes('aina') || name.includes('inrico') || name.includes('hys') ? 'specialized' : 'system';
};

export const supportsMicrophoneControl = (device: BlePeripheral): boolean => (device.advertising?.serviceUUIDs ?? []).some((uuid) => areUuidsEqual(uuid, HFP_SERVICE_UUID) || areUuidsEqual(uuid, HSP_SERVICE_UUID));

const AUDIO_MANUFACTURER_IDS = ['0x004C', '0x001D', '0x000F', '0x0087', '0x02E5']; // Apple, Qualcomm, Broadcom, Mediatek, Realtek

export const hasAudioManufacturerData = (manufacturerData: unknown): boolean => {
  if (typeof manufacturerData === 'string') {
    const lower = manufacturerData.toLowerCase();
    return lower.includes('audio') || lower.includes('headset') || lower.includes('speaker');
  }
  if (typeof manufacturerData !== 'object' || manufacturerData === null) return false;
  return Object.keys(manufacturerData).some((key) => AUDIO_MANUFACTURER_IDS.includes(key) || AUDIO_MANUFACTURER_IDS.includes(`0x${key}`) || AUDIO_MANUFACTURER_IDS.includes(`0x${key.toUpperCase().padStart(4, '0')}`));
};

const decodeServiceData = (data: string): Uint8Array => (/^[0-9A-Fa-f]+$/.test(data) ? (hexDecode(data) ?? new Uint8Array(0)) : (base64Decode(data) ?? new Uint8Array(0)));

/** Class-of-device and capability byte heuristics from advertising service data (Unit analyzeServiceDataForAudio). */
export const analyzeServiceDataForAudio = (data: Uint8Array): boolean => {
  if (data.length === 0) return false;
  const hex = hexEncode(data).toLowerCase();
  const ascii = asciiDecode(data).toLowerCase();
  if (['0001', '0002', '0004', '0008', '1108', '110a', '110b', '111e', '1203'].some((p) => hex.includes(p))) return true;
  if (['aina', 'inrico', 'hys'].some((p) => ascii.includes(p))) return true;
  for (let i = 0; i < data.length - 1; i++) {
    const b1 = data[i] as number;
    const b2 = data[i + 1] as number;
    if ((b1 & 0x1f) === 0x04 && [0x01, 0x02, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a].includes((b2 >> 2) & 0x3f)) return true;
    if (b1 === 0x05 && b2 === 0x80) return true;
  }
  for (let i = 0; i <= data.length - 3; i++) {
    const cod = ((data[i + 2] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i] as number);
    if (((cod >> 8) & 0x1f) === 0x04) return true;
    const serviceClasses = (cod >> 13) & 0x7ff;
    if ((serviceClasses & 0x200) !== 0 || (serviceClasses & 0x40) !== 0) return true;
  }
  return false;
};

export const hasAudioServiceData = (serviceData: unknown): boolean => {
  try {
    if (typeof serviceData === 'string') return analyzeServiceDataForAudio(decodeServiceData(serviceData));
    if (typeof serviceData !== 'object' || serviceData === null) return false;
    return Object.entries(serviceData as Record<string, unknown>).some(([uuid, value]) => {
      if (typeof value !== 'string') return false;
      if ([...AUDIO_SERVICES, '0000FE59-0000-1000-8000-00805F9B34FB', '0000180F-0000-1000-8000-00805F9B34FB'].some((known) => areUuidsEqual(uuid, known))) return true;
      return analyzeServiceDataForAudio(decodeServiceData(value));
    });
  } catch {
    return false;
  }
};

/** Name keywords, audio/PTT service UUIDs (iOS reports 16-bit short forms), manufacturer ids or service data. */
export const isAudioDevice = (device: BlePeripheral): boolean => {
  const name = (device.name ?? device.advertising?.localName ?? '').toLowerCase();
  if (AUDIO_KEYWORDS.some((keyword) => name.includes(keyword))) return true;
  const advertising = device.advertising;
  if (advertising?.serviceUUIDs?.some((uuid) => AUDIO_SERVICES.some((expected) => areUuidsEqual(uuid, expected)))) return true;
  if (advertising?.manufacturerData && hasAudioManufacturerData(advertising.manufacturerData)) return true;
  return advertising?.serviceData ? hasAudioServiceData(advertising.serviceData) : false;
};
