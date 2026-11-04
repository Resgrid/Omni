import type { GetConfigResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';
import fs from 'fs';
import path from 'path';

import { getDepartmentTimeZone, setDepartmentConfig } from '../index';

// SAFETY: a test fixture; only the time zone field is read.
const config = (TimeZoneId?: string | null) => ({ TimeZoneId }) as GetConfigResultData;

describe('department time zone', () => {
  it('is the zone the server sends, trimmed', () => {
    setDepartmentConfig(config(' America/Chicago '));
    expect(getDepartmentTimeZone()).toBe('America/Chicago');
  });

  it('is null without a config, from an older server (no field) and for a department without a zone', async () => {
    setDepartmentConfig(null);
    expect(getDepartmentTimeZone()).toBeNull();
    setDepartmentConfig(config());
    expect(getDepartmentTimeZone()).toBeNull();
    setDepartmentConfig(config(''));
    expect(getDepartmentTimeZone()).toBeNull();

    setDepartmentConfig(config('Europe/London'));
    await defaultResetRegistry.getStoreResets().get('data.department-config')?.('logout');
    expect(getDepartmentTimeZone()).toBeNull();
  });
});

describe('department time source rule', () => {
  const FEATURES_SRC = path.resolve(__dirname, '..', '..');

  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() ? (entry.name === '__tests__' ? [] : walk(path.join(dir, entry.name))) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  // The zone is the second argument; one level of nested parentheses covers a first argument such as `scheduledDispatchUtc(call)`.
  const DEVICE_ZONE_CALL = /\b(?:formatUtcInDepartmentTime|toZonedWallClock|zonedWallClockToUtc|formatInTimeZone)\((?:[^(),]|\([^()]*\))*,\s*(?:null|undefined)\s*[,)]/;

  it('formats and writes call times in the department zone, never a hard-coded device zone', () => {
    const offenders = walk(FEATURES_SRC)
      .filter((file) => DEVICE_ZONE_CALL.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(FEATURES_SRC, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
