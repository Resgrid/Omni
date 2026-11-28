import type { SubmitExternalTrainingInput } from '@resgrid/models';

import { hoursOf, isDateKey, todayKey } from '../../certifications/lib/certification-format';
import { type EvidenceFile, evidenceProblem, toEvidenceInputs } from './evidence';

/** The CE/CPD submission form as typed. */
export interface SubmissionFormValues {
  title: string;
  completedOn: string;
  hours: string;
  categoryId: number | null;
  method: number | null;
  ceProvider: string;
  ceCourseNumber: string;
  ceHours: string;
  notes: string;
  files: readonly EvidenceFile[];
}

export type SubmissionFormErrors = Partial<Record<'title' | 'completedOn' | 'hours' | 'ceHours' | 'files', string>>;

/** Core's length limits (LearningRecord.MaxTitleLength, CE provider 250, course number 100). */
export const MAX_TITLE_LENGTH = 250;

/** Checks the form the way Core does before it is sent; values are translation keys. */
export function validateSubmission(values: SubmissionFormValues, today: string = todayKey()): SubmissionFormErrors {
  const errors: SubmissionFormErrors = {};
  const title = values.title.trim();

  if (!title) errors.title = 'training.submit.title_required';
  else if (title.length > MAX_TITLE_LENGTH) errors.title = 'training.submit.title_too_long';

  if (!isDateKey(values.completedOn.slice(0, 10))) errors.completedOn = 'training.submit.date_required';
  else if (values.completedOn.slice(0, 10) > today) errors.completedOn = 'training.submit.date_future';

  if (hoursOf(values.hours) === null) errors.hours = 'training.submit.hours_invalid';

  if (values.ceHours.trim() !== '' && hoursOf(values.ceHours) === null) errors.ceHours = 'training.submit.hours_invalid';

  const files = evidenceProblem(values.files);

  if (files) errors.files = files;

  return errors;
}

/** The request body; the completion day is sent as noon UTC so no time zone moves it to another day. */
export function toSubmissionInput(values: SubmissionFormValues): SubmitExternalTrainingInput {
  const trim = (text: string): string | null => (text.trim() ? text.trim() : null);

  return {
    Title: values.title.trim(),
    CompletedOn: `${values.completedOn.slice(0, 10)}T12:00:00Z`,
    Hours: hoursOf(values.hours) ?? 0,
    CategoryId: values.categoryId,
    Method: values.method,
    CeProvider: trim(values.ceProvider),
    CeCourseNumber: trim(values.ceCourseNumber),
    CeHours: values.ceHours.trim() ? hoursOf(values.ceHours) : null,
    Notes: trim(values.notes),
    Files: toEvidenceInputs(values.files),
  };
}

/** Core's refusal codes for a submission (`ExternalTrainingSubmissionResult.Error`) → translation keys. */
const REFUSALS = new Map<string, string>([
  ['title_required', 'training.submit.title_required'],
  ['title_too_long', 'training.submit.title_too_long'],
  ['date_invalid', 'training.submit.date_future'],
  ['hours_invalid', 'training.submit.hours_invalid'],
  ['ce_hours_invalid', 'training.submit.hours_invalid'],
  ['category_invalid', 'training.submit.category_invalid'],
  ['text_too_long', 'training.submit.text_too_long'],
  ['file_name_required', 'training.submit.file_invalid'],
  ['file_type_not_allowed', 'training.submit.file_type'],
  ['file_too_large', 'training.submit.file_too_large'],
  ['file_invalid', 'training.submit.file_invalid'],
  ['too_many_files', 'training.submit.too_many_files'],
  ['submissions_disabled', 'training.submit.disabled'],
  ['network', 'errors.data.network'],
]);

export const submissionErrorKey = (code: string | null | undefined): string => REFUSALS.get(code ?? '') ?? 'training.errors.generic';
