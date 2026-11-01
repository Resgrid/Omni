import { type ApiContext, endpointUrl } from '../../core';
import { chatEndpoints } from './chat';

/** Absolute URL of a chat attachment's binary (authenticated; pair with {@link getChatAttachmentImageSource}). */
export const getChatAttachmentUrl = (ctx: ApiContext, attachmentId: string): string => endpointUrl(ctx, chatEndpoints.getChatAttachment, { attachmentId });

/** Absolute URL of a chat attachment's thumbnail. */
export const getChatAttachmentThumbnailUrl = (ctx: ApiContext, attachmentId: string): string => endpointUrl(ctx, chatEndpoints.getChatAttachmentThumbnail, { attachmentId });

export interface AuthenticatedImageSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * Image source (expo-image / RN Image) for a chat attachment. Pass the token the component is subscribed to, so a
 * token rotation re-renders with the new bearer instead of 401-ing on a stale snapshot. The URL is always on the API
 * origin, so the bearer never leaves Resgrid's host.
 */
export const getChatAttachmentImageSource = (ctx: ApiContext, attachmentId: string, accessToken: string | null | undefined, thumbnail = false): AuthenticatedImageSource => ({
  uri: thumbnail ? getChatAttachmentThumbnailUrl(ctx, attachmentId) : getChatAttachmentUrl(ctx, attachmentId),
  ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
});
