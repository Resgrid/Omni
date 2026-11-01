import type { SaveCallFileInput, SaveCallFileResult } from '@resgrid/models';
import axios, { type AxiosProgressEvent } from 'axios';

import { type ApiContext, isSameOrigin, type RequestOptions, toApiError } from '../../core';
import { saveCallFile } from './call-files';

/** `CallFiles` `type` values. */
export const CallFileType = {
  Audio: 1,
  Image: 2,
  File: 3,
} as const;

export interface CallFileUpload {
  callId: string;
  userId: string;
  /** One of {@link CallFileType}. */
  type: number;
  name: string;
  note?: string;
  /** Base64 file content. */
  data: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Body for `CallFiles/SaveCallFile`. Coordinates are sent (as strings) only when both are finite and not 0,0 —
 * a missing fix must not pin the file to "null island".
 */
export const buildSaveCallFileInput = (upload: CallFileUpload): SaveCallFileInput => {
  const { latitude, longitude } = upload;
  const hasFix = typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
  return {
    CallId: upload.callId,
    UserId: upload.userId,
    Type: upload.type,
    Name: upload.name,
    Note: upload.note ?? '',
    Data: upload.data,
    ...(hasFix ? { Latitude: String(latitude), Longitude: String(longitude) } : {}),
  };
};

/** Uploads a call file (image, audio or attachment). */
export const uploadCallFile = (ctx: ApiContext, upload: CallFileUpload, options?: RequestOptions): Promise<SaveCallFileResult> => saveCallFile(ctx, buildSaveCallFileInput(upload), { timeoutMs: 60_000, ...options });

export interface DownloadProgress {
  loaded: number;
  total?: number;
  /** 0–100 when the total is known. */
  percent?: number;
}

export interface DownloadCallAttachmentOptions extends RequestOptions {
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Downloads a call attachment from the URL in the server payload. The bearer token is attached **only** when the URL
 * is on the department's own API origin (Responder's rule): a department on external blob storage gets pre-signed CDN
 * links that carry their own credential, and such a host must never see the member's access token.
 */
export const downloadCallAttachment = async (ctx: ApiContext, url: string, options: DownloadCallAttachmentOptions = {}): Promise<Blob> => {
  const ownOrigin = isSameOrigin(url, ctx.http.getBaseUrl());
  const client = ownOrigin ? ctx.http.axios : axios;
  try {
    const response = await client.get<Blob>(url, {
      responseType: 'blob',
      timeout: options.timeoutMs ?? 30_000,
      signal: options.signal,
      onDownloadProgress: options.onProgress
        ? (event: AxiosProgressEvent) => options.onProgress?.({ loaded: event.loaded, total: event.total, percent: event.total ? Math.round((event.loaded * 100) / event.total) : undefined })
        : undefined,
    });
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
};
