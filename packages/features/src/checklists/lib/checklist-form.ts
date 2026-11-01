import type { DataError } from '@resgrid/data';
import type { ChecklistAnswer, ChecklistDefinition, ChecklistForm, ChecklistInput, ChecklistItem, ChecklistRun, ChecklistTarget } from '@resgrid/models';

// Checklist run form helpers (Responder baseline, identical in Unit). Presentation only: the server scores and
// validates every submission again.

/** ChecklistItem.Type values. */
export const ChecklistItemType = {
  PassFail: 0,
  YesNo: 1,
  Checkbox: 2,
  Number: 3,
  Quantity: 4,
  Text: 5,
  Choice: 6,
  Date: 7,
  Photo: 8,
  Signature: 9,
} as const;

/** ChecklistAnswer.Status values. */
export const ChecklistAnswerStatus = { Unanswered: 0, Answered: 1, NotApplicable: 2 } as const;

/** ChecklistRun.State values. */
export const ChecklistRunState = { InProgress: 0, AwaitingWitness: 1, Submitted: 2 } as const;

/** Items shown for the current answers: a conditional item appears only when its controlling item is shown and answered with the value. */
export const visibleChecklistItems = (form: ChecklistForm, answers: ChecklistAnswer[]): ChecklistItem[] => {
  const visible = new Set<string>();
  return form.Sections.flatMap((section) => section.Items).filter((item) => {
    const condition = item.VisibleWhen;
    const answer = condition ? answers.find((candidate) => candidate.ItemId === condition.ItemId) : undefined;
    const show = !condition || (visible.has(condition.ItemId) && answer?.Status === ChecklistAnswerStatus.Answered && answer.Value === condition.EqualsValue);
    if (show) visible.add(item.Id);
    return show;
  });
};

export const isChecklistRequired = (item: ChecklistItem, answers: ChecklistAnswer[]): boolean =>
  item.Required || (!!item.RequiredWhen && answers.some((answer) => answer.ItemId === item.RequiredWhen?.ItemId && answer.Status === ChecklistAnswerStatus.Answered && answer.Value === item.RequiredWhen.EqualsValue));

export const checklistFailed = (item: ChecklistItem, answer?: ChecklistAnswer): boolean => {
  if (answer?.Status !== ChecklistAnswerStatus.Answered) return false;
  if (item.Type === ChecklistItemType.PassFail) return answer.Value === 'fail';
  if (item.Type === ChecklistItemType.YesNo || item.Type === ChecklistItemType.Checkbox || item.Type === ChecklistItemType.Choice) return answer.Value !== item.PassingValue;
  if (item.Type === ChecklistItemType.Number || item.Type === ChecklistItemType.Quantity) {
    const n = Number(answer.Value);
    return !Number.isFinite(n) || (item.Minimum != null && n < item.Minimum) || (item.Maximum != null && n > item.Maximum);
  }
  return false;
};

/** Choice buttons for an item: `[value, translation key | literal option]`; `literal` marks department option text. */
export const answerChoices = (item: ChecklistItem): { value: string; labelKey: string | null; literal: string | null }[] => {
  switch (item.Type) {
    case ChecklistItemType.PassFail:
      return [
        { value: 'pass', labelKey: 'checklists.labels.Pass', literal: null },
        { value: 'fail', labelKey: 'checklists.labels.Fail', literal: null },
      ];
    case ChecklistItemType.YesNo:
      return [
        { value: 'true', labelKey: 'checklists.labels.Yes', literal: null },
        { value: 'false', labelKey: 'checklists.labels.No', literal: null },
      ];
    case ChecklistItemType.Checkbox:
      return [
        { value: 'true', labelKey: 'checklists.labels.Checked', literal: null },
        { value: 'false', labelKey: 'checklists.labels.Unchecked', literal: null },
      ];
    case ChecklistItemType.Choice:
      return item.Options.map((option) => ({ value: option, labelKey: null, literal: option }));
    default:
      return [];
  }
};

/**
 * The answers after one change: hidden answers are dropped so a stale branch of a conditional form is never submitted.
 */
export const applyAnswer = (form: ChecklistForm, answers: ChecklistAnswer[], itemId: string, patch: Partial<ChecklistAnswer>): ChecklistAnswer[] => {
  const current = answers.find((answer) => answer.ItemId === itemId);
  const changed = [...answers.filter((answer) => answer.ItemId !== itemId), { ...current, ItemId: itemId, Status: current?.Status ?? ChecklistAnswerStatus.Answered, ...patch }];
  const visible = new Set(visibleChecklistItems(form, changed).map((item) => item.Id));
  return changed.filter((answer) => visible.has(answer.ItemId));
};

/** Required, visible items still unanswered (and N/A without a reason, and failures without a required note). */
export const missingAnswers = (form: ChecklistForm, input: ChecklistInput): ChecklistItem[] =>
  visibleChecklistItems(form, input.Answers).filter((item) => {
    const answer = input.Answers.find((candidate) => candidate.ItemId === item.Id);
    if (answer?.Status === ChecklistAnswerStatus.NotApplicable) return !answer.NotApplicableReason?.trim();
    if (item.RequireNoteOnFail && checklistFailed(item, answer) && !answer?.Note?.trim()) return true;
    return isChecklistRequired(item, input.Answers) && answer?.Status !== ChecklistAnswerStatus.Answered;
  });

/**
 * A local, not-yet-started run for an on-demand definition (legacy `startDefinition`): the client GUID is the run id
 * the server adopts when the run is first saved, so a retried start never creates a second run.
 */
export const localRunForDefinition = (definition: ChecklistDefinition, target: ChecklistTarget, id: string, userId: string, isProtected: boolean, now: string): ChecklistRun => ({
  Id: id,
  DefinitionId: definition.Id,
  OccurrenceId: null,
  VersionId: definition.VersionId,
  VersionNumber: definition.VersionNumber,
  Revision: 0,
  State: ChecklistRunState.InProgress,
  IsProtected: isProtected,
  IsPreview: true,
  CanEdit: true,
  CreatedBy: userId,
  UpdatedOn: now,
  Form: definition.PublishedForm,
  Target: target,
  Input: { Revision: 0, Answers: [] },
  Files: [],
});

/** The `checklists.errors.<key>` for a data-layer failure (legacy `checklistError`). */
export const checklistErrorKey = (error: DataError | null | undefined): string | null => {
  if (!error) return null;
  if (error.problemType === 'step_up_required' || error.problemType === 'grant_expired' || error.problemType === 'protected_data_required') return 'locked';
  switch (error.code) {
    case 'unauthorized':
    case 'forbidden':
    case 'not_found':
      return 'denied';
    case 'conflict':
      return 'conflict';
    case 'rejected':
      return 'validation';
    case 'network':
    case 'timeout':
      return 'offline';
    default:
      return 'retry';
  }
};
