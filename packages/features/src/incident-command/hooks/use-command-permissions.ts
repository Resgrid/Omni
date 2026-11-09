import { useAuthStore, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useCommandStore, useCommandSupportStore } from '@resgrid/data';
import { useEffect, useMemo } from 'react';

import { type CommandPermissions, type IncidentCommandTier, resolveCommandPermissions } from '../lib/permissions';

/** The variant's tier, unless a caller (tests, an embedded panel) overrides it. */
export function useIncidentCommandTier(override?: IncidentCommandTier): IncidentCommandTier {
  const tier = useCapability('incidentCommand');

  return override ?? tier;
}

const sameUser = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Board permissions for this member on one incident (see `resolveCommandPermissions`). In the command and assist tiers the
 * server's effective capabilities are read, and re-read whenever the command or its role assignments change (a transfer
 * or a new ICS role changes what the member may do); other tiers never call the endpoint.
 */
export function useCommandPermissions(callId: string | null | undefined, options: { tier?: IncidentCommandTier; isClosed?: boolean } = {}): CommandPermissions {
  const tier = useIncidentCommandTier(options.tier);
  const { canUserCreateCalls, rights } = useSecurity();
  const userId = useAuthStore((state) => state.userId);
  const capabilities = useCommandSupportStore((state) => (callId ? state.capabilitiesByCall[callId] : undefined));
  const fetchCapabilities = useCommandSupportStore((state) => state.fetchCapabilities);
  const entry = useCommandStore((state) => (callId ? state.boards[callId] : undefined));
  const isClosed = options.isClosed === true;
  const command = entry?.board?.Command;
  const fetchesCapabilities = tier === 'assist' || tier === 'command';

  // Who commands and who holds which role decide the capabilities: refetch when either changes.
  const capabilityKey = useMemo(() => {
    const roles = (entry?.board?.Roles ?? [])
      .filter((role) => !role.RemovedOn)
      .map((role) => `${role.UserId}:${role.RoleType}`)
      .sort()
      .join(',');

    return `${command?.IncidentCommandId ?? ''}|${command?.CurrentCommanderUserId ?? ''}|${roles}`;
  }, [command?.CurrentCommanderUserId, command?.IncidentCommandId, entry?.board?.Roles]);

  useEffect(() => {
    if (fetchesCapabilities && callId) void fetchCapabilities(callId, { bypassCache: true });
  }, [callId, capabilityKey, fetchCapabilities, fetchesCapabilities]);

  // Core gives every capability to the commander and whoever established command; a board started on this device is
  // the member's own until the server has it. Used only until the capabilities load, and offline.
  const isOwnBoard = !!entry?.isProvisional || sameUser(command?.CurrentCommanderUserId, userId) || sameUser(command?.EstablishedByUserId, userId);
  // IC establishes under the department's run-command permission (the IC sign-in gate); Dispatch under CanCreateCalls.
  const canEstablish = tier === 'command' ? rights?.CanLoginToCommandApp !== false : canUserCreateCalls;

  return useMemo(() => resolveCommandPermissions({ tier, capabilities, isClosed, canEstablish, isOwnBoard }), [canEstablish, capabilities, isClosed, isOwnBoard, tier]);
}
