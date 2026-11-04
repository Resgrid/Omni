// @resgrid/features/department-config — the signed-in department's `Config/GetConfig` for feature screens (status timer
// thresholds, BigBoard's weather key and map fields, the department time zone). No screens and no routes. The app shell
// hands its copy over with `setDepartmentConfig` (apps/omni/shell-registrations.tsx); a screen can still `load()` it itself.
//
// Re-exported through one statement: Oxlint's readable spacing wants a blank line between top-level statements, which
// the export sorter removes.
import { type DepartmentConfigState, setDepartmentConfig, useDepartmentConfig, useDepartmentConfigStore } from './hooks/use-department-config-store';
import { getDepartmentTimeZone, selectDepartmentTimeZone, useDepartmentTimeZone } from './hooks/use-department-time-zone';

export { type DepartmentConfigState, getDepartmentTimeZone, selectDepartmentTimeZone, setDepartmentConfig, useDepartmentConfig, useDepartmentConfigStore, useDepartmentTimeZone };
