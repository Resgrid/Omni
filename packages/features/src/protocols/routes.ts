import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Protocol routes. The list lives in each variant's (app) group; a protocol opens as its own page. A protocol id that
 * `isSafeRouteId` refuses builds no path (null, reported): a list whose ids all arrived undefined used to crash here.
 */
export const protocolRoutes = {
  protocolList: (): string => '/protocols',
  protocolDetail: (protocolId: string): string | null => routePathWithId('protocols.detail', protocolId, (id) => `/protocols/${id}`),
} as const;

export const { protocolList, protocolDetail } = protocolRoutes;
