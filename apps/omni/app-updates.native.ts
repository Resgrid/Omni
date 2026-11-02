// iOS/Android: the real expo-updates module for @resgrid/core's updates service (docs/subsystems/app-updates.md). Only
// apps/omni depends on expo-updates; core keeps the typed `UpdatesModule` interface, which the module satisfies as it
// is (type-checked here). Development builds hand over nothing: they run Metro's bundle, where expo-updates' checks
// reject. Metro picks this file for native builds only; the web build gets app-updates.ts.
import { isDev, type UpdatesModule } from '@resgrid/core';
import * as Updates from 'expo-updates';

export const appUpdatesModule: UpdatesModule | null = isDev() ? null : Updates;
