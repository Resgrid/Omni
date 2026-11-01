/** Protocol routes. The list lives in each variant's (app) group; details open in a sheet over it. */
export const protocolRoutes = {
  protocolList: (): string => '/protocols',
} as const;

export const { protocolList } = protocolRoutes;
