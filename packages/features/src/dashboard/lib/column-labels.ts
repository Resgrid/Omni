import type { CallsColumnKey, PersonnelColumnKey, ScheduledCallsColumnKey, UnitsColumnKey } from './widget-settings';

/** Translation keys of the table columns (legacy BigBoard keys where they exist, so the existing translations apply). */
export const PERSONNEL_COLUMN_LABEL_KEYS: Readonly<Record<PersonnelColumnKey, string>> = {
  name: 'personnel.column.name',
  group: 'personnel.column.group',
  staffing: 'personnel.column.staffing',
  status: 'personnel.column.status',
  roles: 'personnel.column.roles',
  timestamp: 'personnel.column.timestamp',
};

export const UNITS_COLUMN_LABEL_KEYS: Readonly<Record<UnitsColumnKey, string>> = {
  name: 'dashboard.column.name',
  station: 'dashboard.column.station',
  type: 'dashboard.column.type',
  state: 'dashboard.column.state',
  timestamp: 'dashboard.column.updated',
};

export const CALLS_COLUMN_LABEL_KEYS: Readonly<Record<CallsColumnKey, string>> = {
  id: 'configure.id',
  name: 'configure.name',
  address: 'configure.address',
  timestamp: 'configure.timestamp',
  priority: 'configure.priority',
  dispatched: 'configure.dispatched',
};

export const SCHEDULED_CALLS_COLUMN_LABEL_KEYS: Readonly<Record<ScheduledCallsColumnKey, string>> = {
  name: 'configure.name',
  scheduledTime: 'configure.scheduled_time',
  priority: 'configure.priority',
  address: 'configure.address',
  dispatched: 'configure.dispatched',
};
