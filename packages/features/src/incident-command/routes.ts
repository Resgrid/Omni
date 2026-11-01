import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Incident-command routes. IC keeps its legacy paths (`/command`, `/incidents`, `/command-log/[callId]`,
 * `/command-map/[callId]`, `/resource-map`); Dispatch's full-screen board is `/call/[id]/command`. Ids pass
 * `isSafeRouteId` so a value from a push payload or a link can never build a path outside these trees.
 */
export const INCIDENT_COMMAND_ROUTE_PATTERNS = {
  board: '/command',
  incidents: '/incidents',
  callBoard: '/call/[id]/command',
  log: '/command-log/[callId]',
  map: '/command-map/[callId]',
  resourceMap: '/resource-map',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe incident command route id');
  return encodeURIComponent(id);
};

export interface ResourceMapTarget {
  latitude: number;
  longitude: number;
  title?: string;
  color?: string;
}

export const incidentCommandRoutes = {
  board: (): string => '/command',
  incidents: (): string => '/incidents',
  callBoard: (callId: string): string => `/call/${encodeId(callId)}/command`,
  log: (callId: string): string => `/command-log/${encodeId(callId)}`,
  map: (callId: string): string => `/command-map/${encodeId(callId)}`,
  resourceMap: ({ latitude, longitude, title, color }: ResourceMapTarget): string => {
    const params = [`latitude=${encodeURIComponent(String(latitude))}`, `longitude=${encodeURIComponent(String(longitude))}`];
    if (title) params.push(`title=${encodeURIComponent(title)}`);
    if (color) params.push(`color=${encodeURIComponent(color)}`);
    return `/resource-map?${params.join('&')}`;
  },
} as const;
