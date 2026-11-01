import type { Capabilities } from '@resgrid/config';
import { hasIncidentCapability, IncidentCapabilities } from '@resgrid/models';

/** The variant's incident-command tier (`capabilities.incidentCommand`). */
export type IncidentCommandTier = Capabilities['incidentCommand'];

/**
 * What the signed-in member may do on a command board. One board for every app, gated here (plan §7.10):
 * - `none` (BigBoard) and `view` (Responder/Unit): no board writes; R/U see their own slice (resource view).
 * - `assist` (Dispatch): the server's effective `IncidentCapabilities` for this member and incident decide each action
 *   (Dispatch `command-board-view`); until they load, the board is read-only. Establishing needs `CanCreateCalls`.
 * - `command` (IC): everything — command-app access is already enforced at sign-in (`CanLoginToCommandApp`), the board
 *   must work offline where capabilities cannot be fetched, and the server refuses anything a role may not do.
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
  /** Ad-hoc (non-Resgrid) units and personnel, needs. */
  canManageResources: boolean;
  canManageObjectives: boolean;
  canManageTimers: boolean;
  canManageAccountability: boolean;
  canManageChannels: boolean;
  canAddNotes: boolean;
}

export const NO_COMMAND_PERMISSIONS: CommandPermissions = {
  canViewBoard: false,
  canEstablish: false,
  canManageCommand: false,
  canManageRoles: false,
  canManageStructure: false,
  canAssignResources: false,
  canManageResources: false,
  canManageObjectives: false,
  canManageTimers: false,
  canManageAccountability: false,
  canManageChannels: false,
  canAddNotes: false,
};

export interface PermissionInput {
  tier: IncidentCommandTier;
  /** Server bitmask for this member and incident; undefined while unknown. */
  capabilities?: number;
  isClosed: boolean;
  /** Rights DTO `CanCreateCalls` (assist tier establish). */
  canCreateCalls: boolean;
}

export function resolveCommandPermissions({ tier, capabilities, isClosed, canCreateCalls }: PermissionInput): CommandPermissions {
  if (tier === 'none' || tier === 'view') return NO_COMMAND_PERMISSIONS;
  if (tier === 'command') {
    const write = !isClosed;
    return {
      canViewBoard: true,
      canEstablish: true,
      canManageCommand: write,
      canManageRoles: write,
      canManageStructure: write,
      canAssignResources: write,
      canManageResources: write,
      canManageObjectives: write,
      canManageTimers: write,
      canManageAccountability: write,
      canManageChannels: write,
      canAddNotes: write,
    };
  }
  // assist
  const value = typeof capabilities === 'number' ? capabilities : IncidentCapabilities.None;
  const can = (flag: IncidentCapabilities) => !isClosed && hasIncidentCapability(value, flag);
  return {
    canViewBoard: true,
    canEstablish: canCreateCalls,
    canManageCommand: can(IncidentCapabilities.ManageCommand),
    canManageRoles: can(IncidentCapabilities.ManageCommand),
    canManageStructure: can(IncidentCapabilities.ManageStructure),
    canAssignResources: can(IncidentCapabilities.AssignResources),
    canManageResources: can(IncidentCapabilities.ManageResources),
    canManageObjectives: can(IncidentCapabilities.ManageObjectives),
    canManageTimers: can(IncidentCapabilities.ManageTimers),
    canManageAccountability: can(IncidentCapabilities.ManageAccountability),
    canManageChannels: can(IncidentCapabilities.ManageChannels),
    canAddNotes: can(IncidentCapabilities.ManageCommand) || can(IncidentCapabilities.ManageObjectives),
  };
}
