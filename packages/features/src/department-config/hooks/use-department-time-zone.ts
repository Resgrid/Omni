import { type DepartmentConfigState, useDepartmentConfigStore } from './use-department-config-store';

/**
 * The department's time zone (`GetConfig` `TimeZoneId`): server instants show in it (`formatUtcInDepartmentTime`) and
 * wall-clock input such as a rescheduled dispatch time is sent in it. Null when the server does not send one (older
 * servers, a department without a zone, signed out); the date helpers then use the device zone, as the legacy apps did.
 */
export const selectDepartmentTimeZone = (state: DepartmentConfigState): string | null => state.config?.TimeZoneId?.trim() || null;

export const useDepartmentTimeZone = (): string | null => useDepartmentConfigStore(selectDepartmentTimeZone);

/** The same zone outside React (formatters in `lib/`, store actions). */
export const getDepartmentTimeZone = (): string | null => selectDepartmentTimeZone(useDepartmentConfigStore.getState());
