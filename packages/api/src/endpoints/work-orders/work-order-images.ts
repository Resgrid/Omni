import { type ApiContext, fetchImageDataUri, type RequestOptions } from '../../core';
import { workOrdersEndpoints } from './work-orders';

/** A work order photo as a `data:` URI (PNG/JPEG only, ≤ 10 MB — other content is refused). */
export const getWorkOrderImage = (ctx: ApiContext, fileId: string, options?: RequestOptions): Promise<string> => fetchImageDataUri(ctx, workOrdersEndpoints.getWorkOrderFile, { params: { id: fileId } }, options);
