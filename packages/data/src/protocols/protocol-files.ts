import { type BinaryResponse, getLmsLessonFile, getLmsSignedCaptions, getProtocolFile, getProtocolVersionFile, getTrainingAttachment, getTrainingCertificate, getTrainingTranscriptPdf } from '@resgrid/api';

import { getDataApiContext } from '../core/runtime';

/** A protocol attachment's bytes (online only; the bytes are never persisted). */
export const downloadProtocolAttachment = (protocolAttachmentId: string): Promise<BinaryResponse> => getProtocolFile(getDataApiContext(), { protocolAttachmentId });

/** The primary file of a document-backed protocol version (online only). */
export const downloadProtocolVersionFile = (protocolVersionId: string): Promise<BinaryResponse> => getProtocolVersionFile(getDataApiContext(), { protocolVersionId });

/** A training attachment's bytes (online only). */
export const downloadTrainingAttachment = (trainingAttachmentId: number): Promise<BinaryResponse> => getTrainingAttachment(getDataApiContext(), { trainingAttachmentId });

/** The member's own upload for a file-request lesson (online only). */
export const downloadLessonFile = (lessonFileId: number): Promise<BinaryResponse> => getLmsLessonFile(getDataApiContext(), { lessonFileId });

/** The member's transcript as a PDF, in `locale` when Core has it (online only). */
export const downloadTranscriptPdf = (locale?: string): Promise<BinaryResponse> => getTrainingTranscriptPdf(getDataApiContext(), locale ? { locale } : {});

/** The certificate of completion of one of the member's verified records, in `locale` when Core has it (online only). */
export const downloadCertificate = (learningRecordId: number, locale?: string): Promise<BinaryResponse> => getTrainingCertificate(getDataApiContext(), locale ? { learningRecordId, locale } : { learningRecordId });

/** A WebVTT caption track from a signed playlist link (the API's or an Academy track's host): https only, fetched anonymously (no bearer token). */
export const fetchSignedCaptions = (url: string): Promise<string> => getLmsSignedCaptions(getDataApiContext(), url);
