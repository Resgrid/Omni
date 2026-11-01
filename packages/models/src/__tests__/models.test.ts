import fs from 'node:fs';
import path from 'node:path';

import * as models from '../index';

const v4Dir = path.resolve(__dirname, '../v4');

describe('@resgrid/models barrel', () => {
  it('exports every domain folder', () => {
    const rootIndex = fs.readFileSync(path.join(v4Dir, 'index.ts'), 'utf8');
    const folders = fs.readdirSync(v4Dir).filter((entry) => fs.statSync(path.join(v4Dir, entry)).isDirectory());
    for (const folder of folders) {
      expect(rootIndex).toContain(`export * from './${folder}';`);
      expect(fs.existsSync(path.join(v4Dir, folder, 'index.ts'))).toBe(true);
    }
  });

  it('declares every exported name once (no silent export * collisions)', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (entry !== '__tests__') walk(full);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const match of source.matchAll(/^export (?:declare )?(?:abstract )?(class|interface|enum|const|function) ([A-Za-z0-9_]+)/gm)) {
          const key = match[2];
          const where = path.relative(v4Dir, full);
          if (seen.has(key) && seen.get(key) !== where) duplicates.push(`${key}: ${seen.get(key)} & ${where}`);
          seen.set(key, where);
        }
      }
    };
    walk(v4Dir);
    expect(duplicates).toEqual([]);
  });

  it('dropped Responder duplicates (videoFeeds/*, statuses/customStateDetailTypes, statuses/destinationEntityTypes)', () => {
    expect(fs.existsSync(path.join(v4Dir, 'videoFeeds'))).toBe(false);
    expect(fs.existsSync(path.join(v4Dir, 'statuses/customStateDetailTypes.ts'))).toBe(false);
    expect(fs.existsSync(path.join(v4Dir, 'statuses/destinationEntityTypes.ts'))).toBe(false);
  });

  it('has no runtime imports outside the package', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts')) {
          for (const match of fs.readFileSync(full, 'utf8').matchAll(/^import (type )?.*from '([^']+)';$/gm)) {
            const isType = Boolean(match[1]) || /^import \{ type [^,]+ \}/.test(match[0]);
            if (!match[2].startsWith('.') && !(isType && match[2] === 'geojson')) offenders.push(`${path.relative(v4Dir, full)} -> ${match[2]}`);
          }
        }
      }
    };
    walk(v4Dir);
    expect(offenders).toEqual([]);
  });
});

describe('conflicts reconciled against Core', () => {
  it('envelope carries Core StandardApiResponseV4Base fields', () => {
    const result = new models.CallResult();
    expect(result).toMatchObject({ PageSize: 0, Status: '', RequestId: '' });
    expect(result.Data).toBeInstanceOf(models.CallResultData);
  });

  it('CallResultData.State is the Core CallStates int', () => {
    const call = new models.CallResultData();
    expect(call.State).toBe(0);
    expect(typeof call.State).toBe('number');
  });

  it('CallProtocolsResultData uses Core Id (not ProtocolId)', () => {
    const protocol = new models.CallProtocolsResultData();
    expect(protocol.Id).toBe('');
    expect(protocol).not.toHaveProperty('ProtocolId');
  });

  it('GroupResultData.TypeId is a string', () => {
    expect(new models.GroupResultData().TypeId).toBe('');
  });

  it('check-in models follow Core (PerformCheckInResult.Id string, nullable unit ids)', () => {
    expect(new models.PerformCheckInResult().Id).toBe('');
    expect(new models.PerformCheckInResult()).not.toHaveProperty('Data');
    expect(new models.CheckInRecordResultData().UnitId).toBeNull();
    expect(new models.CheckInTimerStatusResultData().UnitId).toBeNull();
    expect(new models.ResolvedCheckInTimerResultData().UnitTypeId).toBeNull();
    expect(new models.CallPersonnelCheckInStatusResult()).toMatchObject({ CallId: 0, HasActivePersonnelTimer: false });
  });

  it('video feed coordinates and types are nullable numbers', () => {
    const feed = new models.CallVideoFeedResultData();
    expect(feed.Latitude).toBeNull();
    expect(feed.Longitude).toBeNull();
    expect(feed.FeedType).toBeNull();
  });

  it('unit status numerics follow Core', () => {
    const status = new models.UnitStatusResultData();
    expect(status.GroupId).toBe(0);
    expect(status.Latitude).toBeNull();
    expect(status.DestinationId).toBeNull();
  });

  it('weather alerts follow Dispatch / Core numeric enums', () => {
    expect(models.WeatherAlertSeverity.Extreme).toBe(0);
    expect(models.WeatherAlertSeverity.Unknown).toBe(4);
    const alert = new models.WeatherAlertResultData();
    expect(alert.Severity).toBe(0);
    expect(alert.DepartmentId).toBe(0);
  });

  it('shifts use Responder ShiftDayResultData', () => {
    expect(new models.ShiftDayResultData()).toBeInstanceOf(models.ShiftDayResultData);
  });

  it('config carries unit status thresholds and the modern sound flag', () => {
    const config = new models.GetConfigResultData();
    expect(config.UnitStatusThresholds).toEqual([]);
    expect(config.StatusHoldToConfirm).toBe(false);
  });

  it('push inputs carry Source and UnitId (Core PushRegistrationInput)', () => {
    const unit = new models.PushRegistrationUnitInput();
    expect(unit.UnitId).toBe('');
    expect(unit).toBeInstanceOf(models.PushRegistrationInput);
  });

  it('resource incident view not-found status is Core not_found', () => {
    expect(models.INCIDENT_VIEW_STATUS_NOT_FOUND).toBe('not_found');
  });
});

describe('helpers', () => {
  it('status detail helpers are strict by default and lenient on request (Unit)', () => {
    const { CustomStateDetailTypes: D, statusDetailAllowsCalls, statusDetailAllowsPois, statusDetailAllowsStations } = models;
    expect(statusDetailAllowsCalls(D.CallsAndPois)).toBe(true);
    expect(statusDetailAllowsStations(D.Calls)).toBe(false);
    expect(statusDetailAllowsStations(D.Calls, { lenient: true })).toBe(true);
    expect(statusDetailAllowsPois(D.Stations)).toBe(false);
    expect(statusDetailAllowsPois(D.Stations, { lenient: true })).toBe(true);
    expect(statusDetailAllowsPois(D.None, { lenient: true })).toBe(false);
    expect(statusDetailAllowsPois(D.CallsAndStations, { lenient: true })).toBe(true);
    expect(statusDetailAllowsPois(D.StationsAndPois)).toBe(true);
  });

  it('incident capabilities (Dispatch helper over IC enums)', () => {
    const { IncidentCapabilities: C, IncidentRoleType: R, getIncidentRoleCapabilities, hasIncidentCapability } = models;
    expect(getIncidentRoleCapabilities(R.IncidentCommander)).toBe(C.All);
    expect(hasIncidentCapability(getIncidentRoleCapabilities(R.SafetyOfficer), C.ManageAnnotations)).toBe(true);
    expect(hasIncidentCapability(getIncidentRoleCapabilities(R.SafetyOfficer), C.ManageCommand)).toBe(false);
    expect(models.TacticalObjectiveStatus.InProgress).toBe(2);
    expect(models.IncidentNeedCategory.Entity).toBe(6);
    expect(models.ParStatus.Critical).toBe('Critical');
  });

  it('calendar multi-day detection (Responder)', () => {
    expect(models.computeIsMultiDay('2026-01-01T10:00:00', '2026-01-02T09:00:00')).toBe(true);
    expect(models.computeIsMultiDay('2026-01-01', '2026-01-02', true)).toBe(false);
    expect(models.computeIsMultiDay('', '2026-01-02')).toBe(false);
  });
});
