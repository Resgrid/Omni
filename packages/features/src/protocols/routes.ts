import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe protocol route id');

  return encodeURIComponent(id);
};

/** Protocol routes. The list lives in each variant's (app) group; a protocol opens as its own page. */
export const protocolRoutes = {
  protocolList: (): string => '/protocols',
  protocolDetail: (protocolId: string): string => `/protocols/${encodeId(protocolId)}`,
} as const;

export const { protocolList, protocolDetail } = protocolRoutes;
