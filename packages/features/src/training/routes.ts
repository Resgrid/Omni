import { isNumericRouteId, routePathWithId } from '@resgrid/core/navigation/route-paths';

/** The member's training (Responder `/training`, `/training/[id]`, `/training/course/[id]`, `/training/submit`, `/training/submission/[id]`). */
export const TRAINING_ROUTE_PATTERNS = {
  home: '/training',
  detail: '/training/[id]',
  course: '/training/course/[id]',
  submit: '/training/submit',
  submission: '/training/submission/[id]',
} as const;

/** Training and enrollment ids are numeric; anything else builds no path (null, reported). */
export const trainingRoutes = {
  home: (): string => '/training',
  /** A baseline training (its content, attachments and quiz). */
  detail: (trainingId: number | string): string | null => routePathWithId('training.detail', trainingId, (id) => `/training/${id}`, isNumericRouteId),
  /** The course player of one LMS enrollment. */
  course: (enrollmentId: number | string): string | null => routePathWithId('training.course', enrollmentId, (id) => `/training/course/${id}`, isNumericRouteId),
  /** Outside training hours (CE/CPD) with evidence. */
  submit: (): string => '/training/submit',
  /** Answering a reviewer's request for more information on a submission (a learning record id). */
  submission: (recordId: number | string): string | null => routePathWithId('training.submission', recordId, (id) => `/training/submission/${id}`, isNumericRouteId),
} as const;

/** A route parameter as a positive numeric id, or null. */
export const parseTrainingRouteId = (value: string | string[] | null | undefined): number | null => {
  const text = Array.isArray(value) ? value[0] : value;

  if (!text || !/^\d+$/.test(text.trim())) return null;
  const id = Number(text);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
