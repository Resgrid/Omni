import type { Capabilities } from '@resgrid/config';
import { hasIncidentCapability, IncidentCapabilities } from '@resgrid/models';

/** The variant's incident-command tier (`capabilities.incidentCommand`). */
export type IncidentCommandTier = Capabilities['incidentCommand'];

/**
 * What the signed-in member may do on a command board. One board for every app, gated here (plan §7.10):
 * - `none` (BigBoard) and `view` (Responder/Unit): no board writes; R/U see their own slice (resource view).
 * - `assist` (Dispatch) and `command` (IC): the server's effective `IncidentCapabilities` for this member and incident
 *   (`IncidentRoles/GetMyCapabilities`) decide each action — the same checks Core applies to each write, so no control
 *   is offered that the server would refuse. Core gives every capability to the commander and to whoever established
 *   command; ICS roles and command assist give parts; anyone else reads the board without changing it.
 * - Until the capabilities load (or offline), the IC tier treats a board the member commands, established, or started on
 *   this device as fully theirs, and every other board as read-only; Dispatch is read-only.
 * Establishing needs the department's run-command permission (IC, `CanLoginToCommandApp`) or `CanCreateCalls` (Dispatch).
 * A closed command is read-only in every tier.
 */
export interface CommandPermissions {
  /** The full board is shown (assist/command). */
  canViewBoard: boolean;
  canEstablish: boolean;
  /** End, transfer, command details. */
  canManageCommand: boolean;
  /** ICS role assignments. */
  canManageRoles: boolean;
  canManageStructure: boolean;
  canAssignResources: boolean;
  /** Ad-hoc (non-Resgrid) units and personnel. */
  canManageResources: boolean;
  /** Incident needs and their status (Core: ManageObjectives). */
  canManageNeeds: boolean;
  canManageObjectives: boolean;
  canManageTimers: boolean;
  canManageAccountability: boolean;
  canManageChannels: boolean;
  /** Add incident notes (Core: ManageNotes). */
  canAddNotes: boolean;
  /** Choose Public visibility for a note (Core: ManagePublicInformation). */
  canAddPublicNotes: boolean;
}

export const NO_COMMAND_PERMISSIONS: CommandPermissions = {
  canViewBoard: false,
  canEstablish: false,
  canManageCommand: false,
  canManageRoles: false,
  canManageStructure: false,
  canAssignResources: false,
  canManageResources: false,
  canManageNeeds: false,
  canManageObjectives: false,
  canManageTimers: false,
  canManageAccountability: false,
  canManageChannels: false,
  canAddNotes: false,
  canAddPublicNotes: false,
};

export interface PermissionInput {
  tier: IncidentCommandTier;
  /** Server bitmask for this member and incident; undefined while unknown. */
  capabilities?: number;
  isClosed: boolean;
  /** May establish command: rights `CanLoginToCommandApp` (command tier) or `CanCreateCalls` (assist tier). */
  canEstablish: boolean;
  /**
   * The member commands this board, established it, or started it on this device (provisional): Core gives them every
   * capability, so the IC tier can work it before the capabilities load and offline.
   */
  isOwnBoard?: boolean;
}

export function resolveCommandPermissions({ tier, capabilities, isClosed, canEstablish, isOwnBoard = false }: PermissionInput): CommandPermissions {
  if (tier === 'none' || tier === 'view') return NO_COMMAND_PERMISSIONS;
  const known = typeof capabilities === 'number';
  const value = known ? capabilities : tier === 'command' && isOwnBoard ? IncidentCapabilities.All : IncidentCapabilities.None;
  const can = (flag: IncidentCapabilities) => !isClosed && hasIncidentCapability(value, flag);
  return {
    canViewBoard: true,
    canEstablish,
    canManageCommand: can(IncidentCapabilities.ManageCommand),
    canManageRoles: can(IncidentCapabilities.ManageCommand),
    canManageStructure: can(IncidentCapabilities.ManageStructure),
    canAssignResources: can(IncidentCapabilities.AssignResources),
    canManageResources: can(IncidentCapabilities.ManageResources),
    canManageNeeds: can(IncidentCapabilities.ManageObjectives),
    canManageObjectives: can(IncidentCapabilities.ManageObjectives),
    canManageTimers: can(IncidentCapabilities.ManageTimers),
    canManageAccountability: can(IncidentCapabilities.ManageAccountability),
    canManageChannels: can(IncidentCapabilities.ManageChannels),
    canAddNotes: can(IncidentCapabilities.ManageNotes),
    canAddPublicNotes: can(IncidentCapabilities.ManageNotes) && can(IncidentCapabilities.ManagePublicInformation),
  };
}
