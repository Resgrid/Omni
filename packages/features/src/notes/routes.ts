import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe note route id');

  return encodeURIComponent(id);
};

/** Department notes routes. The list lives in each variant's (app) group; a note opens as its own page. */
export const noteRoutes = {
  noteList: (): string => '/notes',
  noteDetail: (noteId: string): string => `/notes/${encodeId(noteId)}`,
} as const;

export const { noteList, noteDetail } = noteRoutes;
