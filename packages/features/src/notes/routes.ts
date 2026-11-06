import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Department notes routes. The list lives in each variant's (app) group; a note opens as its own page. A note id that
 * `isSafeRouteId` refuses builds no path (null, reported).
 */
export const noteRoutes = {
  noteList: (): string => '/notes',
  noteDetail: (noteId: string): string | null => routePathWithId('notes.detail', noteId, (id) => `/notes/${id}`),
} as const;

export const { noteList, noteDetail } = noteRoutes;
