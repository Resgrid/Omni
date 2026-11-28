import type { ProtocolLibraryEntry } from '@resgrid/data';
import type { CallProtocolsResultData, ProtocolAcknowledgmentResultData, ProtocolCategoryResultData, ProtocolStepResultData, ProtocolVersionContentData } from '@resgrid/models';
import { ProtocolKind, ProtocolStepState } from '@resgrid/models';

import type { DownloadableFile } from '../components/file-list';

/** Translation key of a protocol kind (Core `ProtocolKinds`); an unknown kind reads as a plain protocol. */
export function protocolKindKey(kind: number | null | undefined): string {
  switch (kind) {
    case ProtocolKind.Sog:
      return 'protocols.kinds.sog';
    case ProtocolKind.ClinicalGuideline:
      return 'protocols.kinds.clinical';
    case ProtocolKind.Policy:
      return 'protocols.kinds.policy';
    case ProtocolKind.Procedure:
      return 'protocols.kinds.procedure';
    case ProtocolKind.Reference:
      return 'protocols.kinds.reference';
    case ProtocolKind.Bulletin:
      return 'protocols.kinds.bulletin';
    default:
      return 'protocols.kinds.dispatch';
  }
}

/** The kinds a library actually holds, in Core's order, for the filter chips. */
export function kindsInLibrary(entries: Readonly<Record<string, ProtocolLibraryEntry>>, protocols: readonly CallProtocolsResultData[]): number[] {
  const kinds = new Set(protocols.map((protocol) => entries[protocol.Id]?.Kind ?? ProtocolKind.Dispatch));

  return Object.values(ProtocolKind).filter((kind) => kinds.has(kind));
}

/**
 * Protocols search over name, code, number and description (plain text), enabled protocols only, optionally one kind and one
 * department category. The library entry carries the number, kind and category; a protocol without one (an older server) is an
 * uncategorized Dispatch protocol.
 */
export function filterLibrary(
  protocols: readonly CallProtocolsResultData[],
  entries: Readonly<Record<string, ProtocolLibraryEntry>>,
  query: string,
  kind: number | null = null,
  categoryId: number | null = null
): CallProtocolsResultData[] {
  const needle = query.trim().toLowerCase();

  return protocols.filter((protocol) => {
    if (protocol.IsDisabled) return false;
    const entry = entries[protocol.Id];

    if (kind !== null && (entry?.Kind ?? ProtocolKind.Dispatch) !== kind) return false;

    if (categoryId !== null && (entry?.CategoryId ?? null) !== categoryId) return false;

    if (!needle) return true;

    return `${protocol.Name} ${protocol.Code} ${entry?.Number ?? ''} ${protocol.Description}`.toLowerCase().includes(needle);
  });
}

/** The department categories the library uses, in Core's order (sort order, then name), for the category chips. */
export function categoriesInLibrary(categories: readonly ProtocolCategoryResultData[], entries: Readonly<Record<string, ProtocolLibraryEntry>>): ProtocolCategoryResultData[] {
  const used = new Set(Object.values(entries).flatMap((entry) => (entry.CategoryId === null ? [] : [entry.CategoryId])));

  return categories.filter((category) => used.has(category.CategoryId)).sort((a, b) => a.SortOrder - b.SortOrder || (a.Name ?? '').localeCompare(b.Name ?? ''));
}

/**
 * A document-backed version (PDF/DOCX): Core says so (`IsDocument`); an older server sends no flag, and a version with no HTML,
 * blocks or steps is then read as one.
 */
export const isDocumentVersion = (
  content: Pick<ProtocolVersionContentData, 'ContentHtml' | 'ContentJson' | 'Steps' | 'IsDocument'> | null | undefined,
  acknowledgment?: Pick<ProtocolAcknowledgmentResultData, 'IsDocument'> | null
): boolean => {
  if (acknowledgment?.IsDocument === true || content?.IsDocument === true) return true;

  if (!content || content.IsDocument === false) return false;

  return !content.ContentHtml && !content.ContentJson && (content.Steps ?? []).length === 0;
};

/** The document of a document-backed version as the file list shows it: Core's file name, type and size when it sends them. */
export const documentFile = (content: Pick<ProtocolVersionContentData, 'DocumentFileName' | 'DocumentContentType' | 'DocumentSize'> | null | undefined, versionId: string, fallbackName: string): DownloadableFile => ({
  id: versionId,
  name: content?.DocumentFileName || `${fallbackName}.pdf`,
  type: content?.DocumentContentType ?? 'application/pdf',
  size: content?.DocumentSize ?? null,
});

/** The text to show: the version in force (translated when there is an approved translation), else the protocol's own text. */
export const protocolDisplayHtml = (protocol: Pick<CallProtocolsResultData, 'ProtocolText'>, content: Pick<ProtocolVersionContentData, 'ContentHtml'> | null | undefined): string =>
  content?.ContentHtml || protocol.ProtocolText || '';

/** Translation key of an acknowledgment status. */
export function acknowledgmentStatusKey(item: Pick<ProtocolAcknowledgmentResultData, 'Status' | 'IsOverdue'>): string {
  if (item.Status === 'acknowledged') return 'protocols.ack.status_acknowledged';

  if (item.Status === 'awaiting_quiz') return 'protocols.ack.status_quiz';

  return item.IsOverdue ? 'protocols.ack.status_overdue' : 'protocols.ack.status_open';
}

/** Translation key of a step state (Core `ProtocolStepStates`). */
export function stepStateKey(state: number): string {
  switch (state) {
    case ProtocolStepState.Done:
      return 'protocols.steps.state_done';
    case ProtocolStepState.Skipped:
      return 'protocols.steps.state_skipped';
    case ProtocolStepState.NotApplicable:
      return 'protocols.steps.state_na';
    default:
      return 'protocols.steps.state_pending';
  }
}

/** Steps in their protocol order, grouped under their headings (a step without a group sits in the first, unnamed group). */
export function groupSteps(steps: readonly ProtocolStepResultData[] | null | undefined): { group: string | null; steps: ProtocolStepResultData[] }[] {
  const groups: { group: string | null; steps: ProtocolStepResultData[] }[] = [];

  for (const step of [...(steps ?? [])].sort((a, b) => a.Order - b.Order)) {
    const group = step.Group || null;
    const last = groups[groups.length - 1];

    if (last && last.group === group) last.steps.push(step);
    else groups.push({ group, steps: [step] });
  }

  return groups;
}

/** Translation key for an acknowledgment answer that did not sign (Core `ProtocolAcknowledgeOutcomes`). */
export function acknowledgeOutcomeKey(outcome: string | null | undefined): string {
  switch (outcome) {
    case 'Acknowledged':
      return 'protocols.ack.done';
    case 'AwaitingQuiz':
      return 'protocols.ack.quiz_needed';
    case 'ReadNewerVersion':
    case 'ContentChanged':
      return 'protocols.ack.newer_version';
    case 'NotAssigned':
      return 'protocols.ack.not_assigned';
    default:
      return 'protocols.ack.failed';
  }
}
