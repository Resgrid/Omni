import fs from 'node:fs';
import path from 'node:path';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '@resgrid/config';
import { createOutboxHandlerRegistry } from '@resgrid/offline/testing';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { configureLocation, disposeLocation, getLocationTransmitter, resetLocationForTests } from '../configure';
import { LOCATION_PERSON_EVENT, LOCATION_UNIT_EVENT } from '../constants';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useLocationTransmissionStatus } from '../hooks/use-location-transmission-status';
import { type CurrentLocation, type LocationTransmissionStatus, patchTransmissionStatus, setCurrentLocation } from '../location-store';
import { getLocationTaskConsumer, resetLocationTaskRuntimeForTests } from '../task-runtime';
import { defaultLocationSettings, gateOptionsFor } from '../transmitter';
import { __resetLocation } from './fakes/expo-location';
import { __resetTaskManager } from './fakes/expo-task-manager';
import { __resetReactNative } from './fakes/react-native';
import { createFakeApi, createRecordingOutbox, fixAt, ORIGIN } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readManifest = (id: string) => parseVariantManifest(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../../apps/omni/variants/${id}/variant.json`), 'utf8')));

const baseOptions = () => ({
  getApiContext: () => createFakeApi().ctx,
  getOutbox: () => createRecordingOutbox(),
  isSignedIn: () => true,
  getSession: () => ({ userId: 'user-1' }),
  getActiveUnitId: () => 42,
  getSettings: () => ({ realtimeGeolocation: true, backgroundGeolocation: false }),
  autoStart: false,
});

beforeEach(() => {
  __resetReactNative();
  __resetLocation();
  __resetTaskManager();
  resetLocationTaskRuntimeForTests();
  resetLocationForTests();
  resetActiveVariantForTests();
});

afterEach(() => resetLocationForTests());

describe('configureLocation', () => {
  it.each([
    ['responder', 'person', [LOCATION_PERSON_EVENT]],
    ['unit', 'unit', [LOCATION_UNIT_EVENT]],
    ['ic', 'none', []],
    ['dispatch', 'none', []],
    ['bigboard', 'none', []],
  ])('reads the %s manifest: target %s, registers only its own outbox handler', (variant, target, types) => {
    const registry = createOutboxHandlerRegistry();
    const transmitter = configureLocation({ ...baseOptions(), manifest: readManifest(variant), handlerRegistry: registry });
    expect(transmitter.target).toBe(target);
    expect(registry.types()).toEqual(types);
  });

  it('defaults to the active variant and attaches the transmitter to the background task', () => {
    setActiveVariant(readManifest('unit'));
    const transmitter = configureLocation({ ...baseOptions(), handlerRegistry: createOutboxHandlerRegistry() });
    expect(getLocationTransmitter()).toBe(transmitter);
    expect(getLocationTaskConsumer()).toBe(transmitter);
    expect(transmitter.profile.id).toBe('automotive');
  });

  it('replaces a previous instance and unregisters its handlers; dispose detaches everything', () => {
    const registry = createOutboxHandlerRegistry();
    const first = configureLocation({ ...baseOptions(), manifest: readManifest('responder'), handlerRegistry: registry });
    const second = configureLocation({ ...baseOptions(), manifest: readManifest('responder'), handlerRegistry: registry });
    expect(getLocationTransmitter()).toBe(second);
    expect(getLocationTaskConsumer()).not.toBe(first);
    expect(registry.types()).toEqual([LOCATION_PERSON_EVENT]);

    disposeLocation();
    expect(getLocationTransmitter()).toBeNull();
    expect(getLocationTaskConsumer()).toBeNull();
    expect(registry.types()).toEqual([]);
  });

  it('derives settings defaults and gate thresholds per target', () => {
    expect(defaultLocationSettings(readManifest('responder').capabilities.location)).toEqual({ realtimeGeolocation: false, backgroundGeolocation: false });
    expect(defaultLocationSettings(readManifest('unit').capabilities.location)).toEqual({ realtimeGeolocation: true, backgroundGeolocation: false });
    expect(gateOptionsFor('person', null)).toEqual({ minIntervalMs: 15_000, minDistanceMeters: 25, stationaryIntervalMs: 300_000 });
    expect(gateOptionsFor('person', { PersonnelLocationMinMeters: 15, PersonnelLocationStaleSeconds: 300, UnitLocationMinMeters: 99 })).toEqual({
      minIntervalMs: 15_000,
      minDistanceMeters: 15,
      stationaryIntervalMs: 240_000,
    });
    expect(gateOptionsFor('unit', { UnitLocationStaleSeconds: 10 }).stationaryIntervalMs).toBe(60_000);
    expect(gateOptionsFor('unit', { UnitLocationStaleSeconds: 3_600 }).stationaryIntervalMs).toBe(300_000);
  });
});

describe('hooks', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it('useCurrentLocation re-renders on a new position but not on an identical repeat fix', () => {
    const seen: (CurrentLocation | null)[] = [];
    const Probe = (): null => {
      seen.push(useCurrentLocation());
      return null;
    };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(createElement(Probe));
    });
    expect(seen).toEqual([null]);

    act(() => setCurrentLocation(fixAt(ORIGIN, 1), 'watcher'));
    act(() => setCurrentLocation(fixAt(ORIGIN, 2), 'watcher'));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ latitude: ORIGIN.latitude, timestamp: 1, source: 'watcher' });
    act(() => renderer?.unmount());
  });

  it('useLocationTransmissionStatus follows the transmitter status', () => {
    const seen: LocationTransmissionStatus[] = [];
    const Probe = (): null => {
      seen.push(useLocationTransmissionStatus());
      return null;
    };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(createElement(Probe));
    });
    act(() => patchTransmissionStatus({ mode: 'background-task', tracking: true }));
    act(() => patchTransmissionStatus({ mode: 'background-task', tracking: true }));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ mode: 'background-task', tracking: true });
    act(() => renderer?.unmount());
  });
});
