// Background location task registration (omni-plan §7.7). Imported FIRST from apps/omni/index.ts, before expo-router,
// so the task is defined on every launch — including the ones where the OS relaunches a killed app only to deliver a
// location and no route is ever rendered (Responder's fix; Unit dropped those fixes). Defining it from a route module
// is a known defect (omni-porting-from-legacy).
//
// This module must stay cheap and safe at entry time: it cannot call getActiveVariant() (the variant root layout sets
// it later, and never in a headless launch), so it reads the build's own Expo config instead.
import Constants from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { LOCATION_TASK_NAME } from './constants';
import { getLocationLogger } from './logger';
import { handleLocationTaskEvent } from './task-runtime';

export { LOCATION_TASK_NAME } from './constants';
export { registerBackgroundLocationBootstrap } from './task-runtime';

/**
 * - `extra.location`: the variant's location capability written by @resgrid/config-plugins (authoritative).
 * - `plugins`: inferred from the `expo-task-manager` config plugin, which app-config adds only for variants with
 *   background location (`has('task-manager') && backgroundLocation`).
 * - `unknown`: no Expo config at all — defined fail-safe (defining a task that is never started is harmless; not
 *   defining it would drop Responder/Unit background fixes).
 * - `absent`: config present but neither signal says background location → not defined.
 */
export type EntryLocationSource = 'extra.location' | 'plugins' | 'unknown' | 'absent';

export interface EntryLocationConfig {
  variant: string | null;
  background: boolean;
  transmission: 'person' | 'unit' | 'none' | null;
  source: EntryLocationSource;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const TASK_MANAGER_PLUGIN = 'expo-task-manager';

const hasTaskManagerPlugin = (plugins: unknown[]): boolean => plugins.some((entry) => entry === TASK_MANAGER_PLUGIN || (Array.isArray(entry) && entry[0] === TASK_MANAGER_PLUGIN));

const toTransmission = (value: unknown): EntryLocationConfig['transmission'] => (value === 'person' || value === 'unit' || value === 'none' ? value : null);

/** Reads the variant's background-location flag from the build's Expo config (`Constants.expoConfig`). Pure; exported for tests. */
export function resolveEntryLocationConfig(expoConfig: unknown): EntryLocationConfig {
  if (!isRecord(expoConfig)) return { variant: null, background: true, transmission: null, source: 'unknown' };
  const extra = isRecord(expoConfig.extra) ? expoConfig.extra : {};
  const variant = typeof extra.variant === 'string' ? extra.variant : null;

  if (isRecord(extra.location) && typeof extra.location.background === 'boolean') {
    return { variant, background: extra.location.background, transmission: toTransmission(extra.location.transmission), source: 'extra.location' };
  }
  if (Array.isArray(expoConfig.plugins)) {
    return { variant, background: hasTaskManagerPlugin(expoConfig.plugins), transmission: null, source: hasTaskManagerPlugin(expoConfig.plugins) ? 'plugins' : 'absent' };
  }
  return { variant, background: false, transmission: null, source: 'absent' };
}

let entryConfig: EntryLocationConfig | null = null;
let taskDefined = false;

/** What the entry decided (null before the module ran its check). */
export function getEntryLocationConfig(): EntryLocationConfig | null {
  return entryConfig;
}

/** True when this process defined the OS location task. */
export function isBackgroundLocationTaskDefined(): boolean {
  return taskDefined;
}

/**
 * Defines the OS task when the build allows background location on a native platform. Idempotent; returns whether the
 * task is defined. Runs at module load — exported for tests and for an explicit call from a custom entry.
 */
export function defineBackgroundLocationTask(): boolean {
  if (taskDefined) return true;
  entryConfig = resolveEntryLocationConfig(Constants.expoConfig);
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (!entryConfig.background) return false;
  try {
    TaskManager.defineTask<unknown>(LOCATION_TASK_NAME, (body) => handleLocationTaskEvent(body));
    taskDefined = true;
  } catch (error) {
    getLocationLogger().error({ message: 'Failed to define the background location task', context: { error: error instanceof Error ? error.name : typeof error } });
  }
  return taskDefined;
}

/** Test helper: lets a test re-run the entry check. */
export function resetBackgroundLocationTaskForTests(): void {
  taskDefined = false;
  entryConfig = null;
}

defineBackgroundLocationTask();
