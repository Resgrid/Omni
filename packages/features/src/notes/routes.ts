/** Department notes routes. The list lives in each variant's (app) group; details open in a sheet over it. */
export const noteRoutes = {
  noteList: (): string => '/notes',
} as const;

export const { noteList } = noteRoutes;
