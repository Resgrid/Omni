// The OS task must be defined from the entry, for background variants only, and must survive a relaunch where no
// route (and so no configureLocation) ever ran (Responder location-task tests + Omni's headless bootstrap).
import { defineBackgroundLocationTask, isBackgroundLocationTaskDefined, resetBackgroundLocationTaskForTests, resolveEntryLocationConfig } from '../background-task';
import { LOCATION_TASK_NAME } from '../constants';
import { getHeldLocationFix, registerBackgroundLocationBootstrap, resetLocationTaskRuntimeForTests, setLocationTaskConsumer } from '../task-runtime';
import type * as ConstantsFake from './fakes/expo-constants';
import { __setExpoConfig } from './fakes/expo-constants';
import type * as TaskManagerFake from './fakes/expo-task-manager';
import { __getDefinedExecutor, __resetTaskManager, __runTask, defineTask } from './fakes/expo-task-manager';
import { __resetReactNative, AppState, Platform } from './fakes/react-native';
import { fixAt, MOVED, ORIGIN } from './helpers';

const unitConfig = { extra: { variant: 'unit', location: { background: true, transmission: 'unit' } } };
const icConfig = { extra: { variant: 'ic', location: { background: false, transmission: 'none' } } };

beforeEach(() => {
  __resetReactNative();
  __resetTaskManager();
  resetBackgroundLocationTaskForTests();
  resetLocationTaskRuntimeForTests();
  __setExpoConfig({ extra: {} });
});

describe('resolveEntryLocationConfig', () => {
  it('reads extra.location when app config provides it', () => {
    expect(resolveEntryLocationConfig(unitConfig)).toEqual({ variant: 'unit', background: true, transmission: 'unit', source: 'extra.location' });
    expect(resolveEntryLocationConfig(icConfig)).toEqual({ variant: 'ic', background: false, transmission: 'none', source: 'extra.location' });
  });

  it('falls back to the expo-task-manager config plugin, which app-config adds only for background variants', () => {
    expect(resolveEntryLocationConfig({ extra: { variant: 'responder' }, plugins: ['expo-router', ['expo-task-manager', { taskManager: { taskName: 'location-updates' } }]] })).toEqual({
      variant: 'responder',
      background: true,
      transmission: null,
      source: 'plugins',
    });
    expect(resolveEntryLocationConfig({ extra: { variant: 'dispatch' }, plugins: ['expo-router', ['expo-location', {}]] })).toMatchObject({ background: false, source: 'absent' });
    expect(resolveEntryLocationConfig({ extra: { variant: 'ic' } })).toMatchObject({ background: false, source: 'absent' });
  });

  it('defines the task fail-safe when there is no Expo config at all', () => {
    expect(resolveEntryLocationConfig(null)).toMatchObject({ background: true, source: 'unknown' });
  });
});

describe('background task definition', () => {
  it('defines the task at module load for a background variant', () => {
    jest.isolateModules(() => {
      const constants = jest.requireActual<typeof ConstantsFake>('./fakes/expo-constants');
      const taskManager = jest.requireActual<typeof TaskManagerFake>('./fakes/expo-task-manager');
      constants.__setExpoConfig(unitConfig);
      jest.requireActual('../background-task');
      expect(taskManager.defineTask).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.any(Function));
    });
  });

  it('defines the task for a background variant (Responder, Unit)', () => {
    __setExpoConfig(unitConfig);
    expect(defineBackgroundLocationTask()).toBe(true);
    expect(isBackgroundLocationTaskDefined()).toBe(true);
    expect(defineTask).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.any(Function));
  });

  it('does not define the task for foreground-only variants (IC, Dispatch, BigBoard)', () => {
    __setExpoConfig(icConfig);
    expect(defineBackgroundLocationTask()).toBe(false);
    expect(defineTask).not.toHaveBeenCalled();
  });

  it('never defines the task on web or Electron', () => {
    Platform.OS = 'web';
    __setExpoConfig(unitConfig);
    expect(defineBackgroundLocationTask()).toBe(false);
    expect(defineTask).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    __setExpoConfig(unitConfig);
    defineBackgroundLocationTask();
    defineBackgroundLocationTask();
    expect(defineTask).toHaveBeenCalledTimes(1);
  });
});

describe('task executor', () => {
  beforeEach(() => {
    __setExpoConfig(unitConfig);
    defineBackgroundLocationTask();
    expect(__getDefinedExecutor(LOCATION_TASK_NAME)).toBeDefined();
  });

  it('hands the batch to the attached transmitter with the app state', async () => {
    const consumer = { handleTaskLocations: jest.fn(async () => undefined) };
    setLocationTaskConsumer(consumer);
    AppState.currentState = 'background';

    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 1_000), fixAt(MOVED, 2_000)] });

    expect(consumer.handleTaskLocations).toHaveBeenCalledWith([fixAt(ORIGIN, 1_000), fixAt(MOVED, 2_000)], { appState: 'background' });
  });

  it('ignores task errors and empty batches', async () => {
    const consumer = { handleTaskLocations: jest.fn(async () => undefined) };
    setLocationTaskConsumer(consumer);

    await __runTask(LOCATION_TASK_NAME, { locations: [] });
    await __runTask(LOCATION_TASK_NAME, null, { code: 1, message: 'denied' });

    expect(consumer.handleTaskLocations).not.toHaveBeenCalled();
  });

  it('runs the headless bootstrap once when the OS relaunched the app without mounting a route', async () => {
    const consumer = { handleTaskLocations: jest.fn(async () => undefined) };
    const bootstrap = jest.fn(async () => setLocationTaskConsumer(consumer));
    registerBackgroundLocationBootstrap(bootstrap);
    AppState.currentState = 'background';

    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 1_000)] });
    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(MOVED, 2_000)] });

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(consumer.handleTaskLocations).toHaveBeenCalledTimes(2);
  });

  it('holds the newest fix when nothing can process it, and hands it over once the transmitter attaches', async () => {
    AppState.currentState = 'background';

    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 1_000), fixAt(MOVED, 3_000)] });
    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 2_000)] });
    expect(getHeldLocationFix()?.timestamp).toBe(3_000);

    const consumer = { handleTaskLocations: jest.fn(async () => undefined) };
    setLocationTaskConsumer(consumer);

    expect(consumer.handleTaskLocations).toHaveBeenCalledWith([fixAt(MOVED, 3_000)], { appState: 'background' });
    expect(getHeldLocationFix()).toBeNull();
  });

  it('keeps going when the bootstrap fails, and retries it on the next batch', async () => {
    const bootstrap = jest.fn(async () => {
      throw new Error('storage unavailable');
    });
    registerBackgroundLocationBootstrap(bootstrap);

    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 1_000)] });
    await __runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 2_000)] });

    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(getHeldLocationFix()?.timestamp).toBe(2_000);
  });

  it('survives a consumer that throws', async () => {
    setLocationTaskConsumer({
      handleTaskLocations: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(__runTask(LOCATION_TASK_NAME, { locations: [fixAt(ORIGIN, 1_000)] })).resolves.toBeUndefined();
  });
});
