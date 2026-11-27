import { readQueuedFileData } from '@resgrid/data';
import type { TrainingEvidenceFileInput } from '@resgrid/models';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { capturePhoto, isHeicImage, toUploadJpeg } from '../../certifications/lib/capture-photo';

/** Core's evidence rules (TrainingSubmissionRules / TrainingEvidencePolicy): five files, 10 MB each, 30 MB together. */
export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_TOTAL_BYTES = 30 * 1024 * 1024;

/** The document types Core accepts (by extension); HEIC is never sent: photos are converted to JPEG on the device first. */
const DOCUMENT_EXTENSIONS = new Set<string>(['pdf', 'doc', 'docx', 'odt']);
const IMAGE_EXTENSIONS = new Set<string>(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);
const PICKER_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'image/*'];

export interface EvidenceFile {
  /** Local id (list key). */
  id: string;
  name: string;
  contentType: string;
  base64: string;
  bytes: number;
}

export class EvidenceTypeError extends Error {
  constructor() {
    super('file_type_not_allowed');
    this.name = 'EvidenceTypeError';
  }
}

/** Decoded size of a base64 string (padding aware). */
export const base64Bytes = (base64: string): number => {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

const extensionOf = (name: string): string => (name.split('.').pop() ?? '').toLowerCase();

let counter = 0;
const nextId = (): string => `evidence-${Date.now()}-${(counter += 1)}`;

const toEvidence = (name: string, contentType: string, base64: string): EvidenceFile => ({ id: nextId(), name, contentType, base64, bytes: base64Bytes(base64) });

/** A photo from the camera or library: always a JPEG without metadata (HEIC converted on the device). Null when cancelled. */
export async function pickEvidencePhoto(source: 'camera' | 'library'): Promise<EvidenceFile | null> {
  const photo = await capturePhoto(source, 'evidence.jpg');

  return photo ? toEvidence(photo.name, photo.contentType, photo.base64) : null;
}

/**
 * A certificate or document from the device's files. An image (HEIC/HEIF included) is re-encoded as a JPEG without
 * metadata, so a phone's HEIC photo and its location never reach Core; PDF, DOC, DOCX and ODT go as they are. Other types
 * throw EvidenceTypeError. Null when cancelled.
 */
export async function pickEvidenceDocument(): Promise<EvidenceFile | null> {
  const isWeb = Platform.OS === 'web';
  const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false, base64: isWeb });
  const asset = result.canceled ? null : result.assets[0];

  if (!asset) return null;

  const extension = extensionOf(asset.name);
  const isImage = (asset.mimeType ?? '').startsWith('image/') || IMAGE_EXTENSIONS.has(extension) || isHeicImage(asset.mimeType, asset.name);

  if (isImage) {
    const photo = await toUploadJpeg(asset.uri, undefined, undefined, asset.name);

    return toEvidence(photo.name, photo.contentType, photo.base64);
  }

  if (!DOCUMENT_EXTENSIONS.has(extension)) throw new EvidenceTypeError();

  const base64 = isWeb ? (asset.base64?.split(',', 2)[1] ?? '') : await readQueuedFileData({ data: null, stagedUri: asset.uri });

  if (!base64) throw new EvidenceTypeError();

  return toEvidence(asset.name, asset.mimeType ?? 'application/octet-stream', base64);
}

/** Why the evidence cannot be sent (a translation key), or null: too many files, one too large, or too much together. */
export function evidenceProblem(files: readonly Pick<EvidenceFile, 'bytes'>[]): string | null {
  if (files.length > MAX_EVIDENCE_FILES) return 'training.submit.too_many_files';

  if (files.some((file) => file.bytes > MAX_EVIDENCE_FILE_BYTES)) return 'training.submit.file_too_large';

  if (files.reduce((sum, file) => sum + file.bytes, 0) > MAX_EVIDENCE_TOTAL_BYTES) return 'training.submit.files_too_large';

  return null;
}

/** The submission's `Files`: never a HEIC name or type (the converter renamed and re-typed every photo). */
export const toEvidenceInputs = (files: readonly EvidenceFile[]): TrainingEvidenceFileInput[] => files.map((file) => ({ FileName: file.name, ContentType: file.contentType, Data: file.base64 }));
