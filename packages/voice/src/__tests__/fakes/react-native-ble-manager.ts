// react-native-ble-manager fake: jest functions plus listener registries tests can emit into.
type Handler = (payload: any) => void;
const listeners: Record<string, Set<Handler>> = {};

const subscribe = (event: string) =>
  jest.fn((handler: Handler) => {
    (listeners[event] ??= new Set()).add(handler);
    return { remove: () => listeners[event]?.delete(handler) };
  });

export enum BleScanCallbackType {
  AllMatches = 1,
}
export enum BleScanMatchMode {
  Sticky = 2,
}
export enum BleScanMode {
  LowLatency = 2,
}

export type BleState = 'on' | 'off' | 'turning_on' | 'turning_off' | 'unknown' | 'unauthorized' | 'resetting' | 'unsupported';
export interface Peripheral {
  id: string;
  name?: string;
  rssi: number;
  advertising: any;
}
export interface PeripheralInfo extends Peripheral {
  characteristics?: { service: string; characteristic: string; properties: any }[];
}

const BleManager = {
  start: jest.fn(async () => undefined),
  checkState: jest.fn(async () => 'on'),
  scan: jest.fn(async () => undefined),
  stopScan: jest.fn(async () => undefined),
  connect: jest.fn(async () => undefined),
  disconnect: jest.fn(async () => undefined),
  getConnectedPeripherals: jest.fn(async (): Promise<Peripheral[]> => []),
  retrieveServices: jest.fn(async (): Promise<PeripheralInfo> => ({ id: '', rssi: 0, advertising: {}, characteristics: [] })),
  startNotification: jest.fn(async () => undefined),
  read: jest.fn(async (): Promise<number[]> => []),
  onDidUpdateState: subscribe('state'),
  onDisconnectPeripheral: subscribe('disconnect'),
  onDiscoverPeripheral: subscribe('discover'),
  onDidUpdateValueForCharacteristic: subscribe('value'),
  onStopScan: subscribe('stopScan'),
};

export const emitBleEvent = (event: 'state' | 'disconnect' | 'discover' | 'value' | 'stopScan', payload: unknown): void => {
  [...(listeners[event] ?? [])].forEach((handler) => handler(payload));
};

export const resetBleFake = (): void => {
  for (const key of Object.keys(listeners)) delete listeners[key];
};

export default BleManager;
