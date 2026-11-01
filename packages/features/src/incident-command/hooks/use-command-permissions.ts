import { useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useCommandSupportStore } from '@resgrid/data';
import { useEffect, useMemo } from 'react';

import { type CommandPermissions, type IncidentCommandTier, resolveCommandPermissions } from '../lib/permissions';

/** The variant's tier, unless a caller (tests, an embedded panel) overrides it. */
export function useIncidentCommandTier(override?: IncidentCommandTier): IncidentCommandTier {
  const tier = useCapability('incidentCommand');
  return override ?? tier;
}

/**
 * Board permissions for this member on one incident (see `resolveCommandPermissions`). In the assist tier the server's
 * effective capabilities are read (and re-read when the incident changes); other tiers never call the endpoint.
 */
export function useCommandPermissions(callId: string | null | undefined, options: { tier?: IncidentCommandTier; isClosed?: boolean } = {}): CommandPermissions {
  const tier = useIncidentCommandTier(options.tier);
  const { canUserCreateCalls } = useSecurity();
  const capabilities = useCommandSupportStore((state) => (callId ? state.capabilitiesByCall[callId] : undefined));
  const fetchCapabilities = useCommandSupportStore((state) => state.fetchCapabilities);
  const isClosed = options.isClosed === true;

  useEffect(() => {
    if (tier === 'assist' && callId) void fetchCapabilities(callId);
  }, [callId, fetchCapabilities, tier]);

  return useMemo(() => resolveCommandPermissions({ tier, capabilities, isClosed, canCreateCalls: canUserCreateCalls }), [canUserCreateCalls, capabilities, isClosed, tier]);
}
