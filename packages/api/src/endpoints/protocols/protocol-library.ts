import type {
  AcknowledgeProtocolInput,
  AcknowledgeProtocolResult,
  AnswerWeeklyQuestionInput,
  AnswerWeeklyQuestionResult,
  CallProtocolChecklistResult,
  CompleteCallChecklistInput,
  GetBankQuizResult,
  GetCallProtocolChecklistsResult,
  GetMyProtocolAcknowledgmentsResult,
  GetProtocolCategoriesResult,
  GetProtocolVersionContentResult,
  GetSopLibraryResult,
  GetWeeklyQuestionsResult,
  RecordCallStepInput,
  StartCallChecklistInput,
  SubmitBankQuizInput,
  SubmitBankQuizResult,
} from '@resgrid/models';

import { type ApiContext, type BinaryResponse, cachedRequest, type CachedRequestOptions, defineEndpoints, request, requestBinary, type RequestOptions } from '../../core';

/**
 * Core v4 protocol library endpoints for Omni (protocols plan P1–P3): a version as the reader is shown it, attachment and
 * document bytes, the member's acknowledgments with the question-bank quiz, and a call's step-through checklists. Every read
 * applies Core's protocol read rule (published, in the caller's audience). The contract test checks every entry against Swagger.
 */
export const protocolLibraryEndpoints = defineEndpoints('protocolLibrary', {
  getProtocolVersionContent: { method: 'GET', path: '/ProtocolContent/GetVersionContent', query: ['protocolVersionId', 'locale'] },
  getProtocolFile: { method: 'GET', path: '/Protocols/GetFile', query: ['protocolAttachmentId'], responseType: 'arraybuffer' },
  getProtocolVersionFile: { method: 'GET', path: '/ProtocolAcknowledgments/GetVersionFile', query: ['protocolVersionId'], responseType: 'arraybuffer' },
  getMyProtocolAcknowledgments: { method: 'GET', path: '/ProtocolAcknowledgments/GetMyAcknowledgments', query: ['includeCompleted'] },
  acknowledgeProtocol: { method: 'POST', path: '/ProtocolAcknowledgments/Acknowledge', body: 'json' },
  getProtocolBankQuiz: { method: 'GET', path: '/ProtocolAcknowledgments/GetBankQuiz', query: ['protocolVersionId', 'locale'] },
  submitProtocolBankQuiz: { method: 'POST', path: '/ProtocolAcknowledgments/SubmitBankQuiz', body: 'json' },
  getCallProtocolChecklists: { method: 'GET', path: '/ProtocolContent/GetCallChecklists', query: ['callId'] },
  getProtocolSopLibrary: { method: 'GET', path: '/ProtocolContent/GetSopLibrary' },
  startCallProtocolChecklist: { method: 'POST', path: '/ProtocolContent/StartCallChecklist', body: 'json' },
  recordCallProtocolStep: { method: 'POST', path: '/ProtocolContent/RecordCallStep', body: 'json' },
  completeCallProtocolChecklist: { method: 'POST', path: '/ProtocolContent/CompleteCallChecklist', body: 'json' },
  getProtocolCategories: { method: 'GET', path: '/Protocols/GetCategories', cacheTtlMs: 6 * 60 * 60 * 1000 },
  getWeeklyProtocolQuestions: { method: 'GET', path: '/ProtocolAcknowledgments/GetWeeklyQuestions' },
  answerWeeklyProtocolQuestion: { method: 'POST', path: '/ProtocolAcknowledgments/AnswerWeeklyQuestion', body: 'json' },
});

const E = protocolLibraryEndpoints;

/** A version in the reader's language (approved translation, else the source) with its steps. `GET /ProtocolContent/GetVersionContent`. */
export const getProtocolVersionContent = (ctx: ApiContext, params: { protocolVersionId: number | string; locale?: string }, options?: RequestOptions): Promise<GetProtocolVersionContentResult> =>
  request<GetProtocolVersionContentResult>(ctx, E.getProtocolVersionContent, { params }, options);

/** An attachment's bytes (the one place they leave Core). `GET /Protocols/GetFile`. */
export const getProtocolFile = (ctx: ApiContext, params: { protocolAttachmentId: number | string }, options?: RequestOptions): Promise<BinaryResponse> => requestBinary(ctx, E.getProtocolFile, { params }, options);

/** The primary file (PDF/DOCX) of a document-backed version. `GET /ProtocolAcknowledgments/GetVersionFile`. */
export const getProtocolVersionFile = (ctx: ApiContext, params: { protocolVersionId: number | string }, options?: RequestOptions): Promise<BinaryResponse> =>
  requestBinary(ctx, E.getProtocolVersionFile, { params }, options);

/** The member's outstanding acknowledgments (bulletins first), completed ones too when asked. `GET /ProtocolAcknowledgments/GetMyAcknowledgments`. */
export const getMyProtocolAcknowledgments = (ctx: ApiContext, params: { includeCompleted?: boolean } = {}, options?: RequestOptions): Promise<GetMyProtocolAcknowledgmentsResult> =>
  request<GetMyProtocolAcknowledgmentsResult>(ctx, E.getMyProtocolAcknowledgments, { params }, options);

/** Read-and-sign with the version and the content hash read. `POST /ProtocolAcknowledgments/Acknowledge`. */
export const acknowledgeProtocol = (ctx: ApiContext, body: AcknowledgeProtocolInput, options?: RequestOptions): Promise<AcknowledgeProtocolResult> =>
  request<AcknowledgeProtocolResult>(ctx, E.acknowledgeProtocol, { body }, options);

/** Starts or resumes the question-bank quiz of a version the member owes (questions and options, never a key). `GET /ProtocolAcknowledgments/GetBankQuiz`. */
export const getProtocolBankQuiz = (ctx: ApiContext, params: { protocolVersionId: number | string; locale?: string }, options?: RequestOptions): Promise<GetBankQuizResult> =>
  request<GetBankQuizResult>(ctx, E.getProtocolBankQuiz, { params }, options);

/** Scores a bank-quiz attempt on the server. `POST /ProtocolAcknowledgments/SubmitBankQuiz`. */
export const submitProtocolBankQuiz = (ctx: ApiContext, body: SubmitBankQuizInput, options?: RequestOptions): Promise<SubmitBankQuizResult> =>
  request<SubmitBankQuizResult>(ctx, E.submitProtocolBankQuiz, { body }, options);

/** The call's step-through checklists with each step's state. `GET /ProtocolContent/GetCallChecklists`. */
export const getCallProtocolChecklists = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<GetCallProtocolChecklistsResult> =>
  request<GetCallProtocolChecklistsResult>(ctx, E.getCallProtocolChecklists, { params }, options);

/** Procedure protocols in force the member may start on a call (MAYDAY, RIT, hazmat entry). `GET /ProtocolContent/GetSopLibrary`. */
export const getProtocolSopLibrary = (ctx: ApiContext, options?: RequestOptions): Promise<GetSopLibraryResult> => request<GetSopLibraryResult>(ctx, E.getProtocolSopLibrary, {}, options);

/** Starts a protocol checklist on a call. `POST /ProtocolContent/StartCallChecklist`. */
export const startCallProtocolChecklist = (ctx: ApiContext, body: StartCallChecklistInput, options?: RequestOptions): Promise<CallProtocolChecklistResult> =>
  request<CallProtocolChecklistResult>(ctx, E.startCallProtocolChecklist, { body }, options);

/** One step event (done, skipped, not applicable, or back to pending); the server stamps the time. `POST /ProtocolContent/RecordCallStep`. */
export const recordCallProtocolStep = (ctx: ApiContext, body: RecordCallStepInput, options?: RequestOptions): Promise<CallProtocolChecklistResult> =>
  request<CallProtocolChecklistResult>(ctx, E.recordCallProtocolStep, { body }, options);

/** Completes a call's protocol checklist. `POST /ProtocolContent/CompleteCallChecklist`. */
export const completeCallProtocolChecklist = (ctx: ApiContext, body: CompleteCallChecklistInput, options?: RequestOptions): Promise<CallProtocolChecklistResult> =>
  request<CallProtocolChecklistResult>(ctx, E.completeCallProtocolChecklist, { body }, options);

/** The department's protocol categories (cached like the library). `GET /Protocols/GetCategories`. */
export const getProtocolCategories = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetProtocolCategoriesResult> => cachedRequest<GetProtocolCategoriesResult>(ctx, E.getProtocolCategories, {}, options);

/** The member's weekly micro-learning questions (LMS), newest first. `GET /ProtocolAcknowledgments/GetWeeklyQuestions`. */
export const getWeeklyProtocolQuestions = (ctx: ApiContext, options?: RequestOptions): Promise<GetWeeklyQuestionsResult> => request<GetWeeklyQuestionsResult>(ctx, E.getWeeklyProtocolQuestions, {}, options);

/** Answers a weekly question once; the answer returns the correct keys and the explanation. `POST /ProtocolAcknowledgments/AnswerWeeklyQuestion`. */
export const answerWeeklyProtocolQuestion = (ctx: ApiContext, body: AnswerWeeklyQuestionInput, options?: RequestOptions): Promise<AnswerWeeklyQuestionResult> =>
  request<AnswerWeeklyQuestionResult>(ctx, E.answerWeeklyProtocolQuestion, { body }, options);
