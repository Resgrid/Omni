import type { Capabilities } from '@resgrid/config';

/**
 * What this app does with a deployment. The server enforces every rule again (TimeAccess, cost access, MARS access);
 * this only shapes the UI. Each legacy app hard-coded its own copy (`lib/operations/capabilities.ts`):
 *
 * | | editTime | recordUsage / recordExpenses | approveTime | draftF42 |
 * |---|---|---|---|---|
 * | Responder | ✓ | ✓ | ✓ | ✓ |
 * | Unit | ✓ (active unit's CTR) | ✓ | — (shared vehicle device) | ✓ |
 * | IC | ✓ | — (crews record their own) | ✓ | ✓ |
 * | Dispatch / BigBoard | — (read-only) | — | — | — |
 *
 * Until the manifest carries an explicit `capabilities.operations` block (TODO(config)), the same table is derived
 * from capabilities that already distinguish these roles, so no per-app fork exists: a field member device
 * (`checkIn.self`) writes time; a unit-subject device (`status.subject: 'unit'`) never approves; a command board
 * (`incidentCommand: 'command'`) leaves usage and expenses to the crews.
 */
export interface OperationsCapabilities {
  /** Write crew / individual time reports. */
  editTime: boolean;
  /** Record odometer / engine / fuel readings against a deployment unit. */
  recordUsage: boolean;
  /** Add expenses (meals, fuel, lodging) with a receipt photo. */
  recordExpenses: boolean;
  /** Approve submitted time reports when the person holds TimeReports_Approve. */
  approveTime: boolean;
  /** Draft and validate the CAL OES MARS F-42 from the field. */
  draftF42: boolean;
  /** The device's active unit picks the default crew report (Unit). */
  usesActiveUnit: boolean;
}

export function resolveOperationsCapabilities(capabilities: Capabilities): OperationsCapabilities {
  const fieldMember = capabilities.checkIn.self;
  const unitDevice = capabilities.status.subject === 'unit';
  const commandBoard = capabilities.incidentCommand === 'command';
  return {
    editTime: fieldMember,
    recordUsage: fieldMember && !commandBoard,
    recordExpenses: fieldMember && !commandBoard,
    approveTime: fieldMember && !unitDevice,
    draftF42: fieldMember,
    usesActiveUnit: unitDevice,
  };
}
