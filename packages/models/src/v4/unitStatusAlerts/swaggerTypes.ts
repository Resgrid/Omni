// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.UnitStatusAlerts.AcknowledgeUnitStatusAlertInput` (generated from Swagger v4). */
export interface AcknowledgeUnitStatusAlertInput {
  UnitId: number;
  /** The unit's CurrentUnitStateId as the board saw it. */
  UnitStateId: number;
  /** The level the board is showing: 1 = warning, 2 = alert. */
  Level?: number;
  /** 0 = acknowledge, 1 = mute. */
  Mode?: number;
  /** For a mute, the minutes to mute for. 0 mutes until the unit changes status. */
  MuteMinutes?: number;
  Note?: string | null;
}
