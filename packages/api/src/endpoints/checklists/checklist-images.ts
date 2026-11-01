import { type ApiContext, fetchImageDataUri, type RequestOptions } from '../../core';
import { checklistsEndpoints } from './checklists';

/** A checklist run photo as a `data:` URI (PNG/JPEG only, ≤ 10 MB — other content is refused). */
export const getChecklistRunImage = (ctx: ApiContext, id: string, options?: RequestOptions): Promise<string> => fetchImageDataUri(ctx, checklistsEndpoints.getChecklistRunFile, { params: { id } }, options);
