import type { CallProtocolsResultData, ProtocolResultData } from '@resgrid/models';

/**
 * A wire list's entries: Core sends null for an empty list (and can send a null entry), and a copy an older build
 * persisted is JSON nobody re-checked, so a list that is missing or not an array is empty and null entries are dropped:
 * one bad entry no longer throws the whole list away.
 */
const entriesOf = <T>(list: readonly (T | null | undefined)[] | null | undefined): T[] => (Array.isArray(list) ? list.flatMap((entry) => (entry === null || entry === undefined ? [] : [entry])) : []);

/**
 * A protocol from the `Protocols` controller (Core `ProtocolResultData`: `ProtocolId`, a numeric `DepartmentId`,
 * `ProtocolTriggerId`…) as the `CallProtocolsResultData` every protocol screen reads, which is also what a call's
 * protocols and the `CallProtocols` controller send. Reading the wire item as if it had `Id` left every protocol
 * without an id, and opening one threw "Unsafe protocol route id" (an app crash on Android).
 *
 * An item already in the screen shape is returned as is, so the copies an older build persisted (the raw wire items)
 * and fresh answers both come out the same. Core strings can be null on the wire whatever the model says, hence the
 * fallbacks.
 */
export function toCallProtocol(protocol: ProtocolResultData | CallProtocolsResultData): CallProtocolsResultData {
  if (!('ProtocolId' in protocol)) return protocol;

  return {
    Id: protocol.ProtocolId ?? '',
    DepartmentId: protocol.DepartmentId == null ? '' : String(protocol.DepartmentId),
    Name: protocol.Name ?? '',
    Code: protocol.Code ?? '',
    Description: protocol.Description ?? '',
    ProtocolText: protocol.ProtocolText ?? '',
    CreatedOn: protocol.CreatedOn ?? '',
    CreatedByUserId: protocol.CreatedByUserId ?? '',
    IsDisabled: protocol.IsDisabled === true,
    UpdatedOn: protocol.UpdatedOn ?? '',
    UpdatedByUserId: protocol.UpdatedByUserId ?? '',
    MinimumWeight: protocol.MinimumWeight ?? 0,
    State: protocol.State ?? 0,
    Triggers: entriesOf(protocol.Triggers).map((trigger) => ({
      Id: trigger.ProtocolTriggerId ?? '',
      Type: trigger.Type ?? 0,
      StartsOn: trigger.StartsOn ?? '',
      EndsOn: trigger.EndsOn ?? '',
      Priority: trigger.Priority ?? 0,
      CallType: trigger.CallType ?? '',
      Geofence: trigger.Geofence ?? '',
    })),
    Attachments: entriesOf(protocol.Attachments).map((attachment) => ({
      Id: attachment.ProtocolTriggerAttachmentId ?? '',
      FileName: attachment.FileName ?? '',
      FileType: attachment.FileType ?? '',
    })),
    Questions: entriesOf(protocol.Questions).map((question) => ({
      Id: question.ProtocolTriggerQuestionId ?? '',
      Question: question.Question ?? '',
      Answers: entriesOf(question.Answers).map((answer) => ({ Id: answer.ProtocolQuestionAnswerId ?? '', Answer: answer.Answer ?? '', Weight: answer.Weight ?? 0 })),
    })),
  };
}

/** Every protocol in a list (a fresh answer or a persisted copy) in the screen shape; null entries are dropped. */
export function toCallProtocols(list: readonly (ProtocolResultData | CallProtocolsResultData | null)[] | null | undefined): CallProtocolsResultData[] {
  return entriesOf(list).map(toCallProtocol);
}

/** What `omni-protocols-storage` held before version 1: the raw wire items under `protocols`. */
export interface PersistedProtocolsV0 {
  protocols?: (ProtocolResultData | CallProtocolsResultData | null)[] | null;
  protocolDetailsById?: Record<string, CallProtocolsResultData> | null;
  fetchedAt?: Record<string, number> | null;
}

/** A protocol attachment as the library lists it (metadata only; the bytes come from `Protocols/GetFile`). */
export interface ProtocolLibraryAttachment {
  Id: string;
  FileName: string;
  FileType: string;
  Size: number | null;
}

/**
 * What the library shows beside a protocol's text (protocols plan P1): its kind, number, the version in force with its
 * effective date, whether that version asks for read-and-sign, and its attachments with their sizes. Kept beside the
 * screen-shape protocol because `CallProtocolsResultData` (a call's protocols) carries none of it. Older servers send none
 * of these fields: Kind 0 and no version.
 */
export interface ProtocolLibraryEntry {
  Id: string;
  Kind: number;
  Number: string | null;
  CurrentVersionId: string | null;
  VersionLabel: string | null;
  EffectiveOn: string | null;
  RequiresAcknowledgment: boolean;
  /** The department category (`Protocols/GetCategories`); null when uncategorized or from an older server. */
  CategoryId: number | null;
  Attachments: ProtocolLibraryAttachment[];
}

/** The library entry of a `Protocols` controller item, or null for an item in the screen shape (it has none of it). */
export function toLibraryEntry(protocol: ProtocolResultData | CallProtocolsResultData | null | undefined): ProtocolLibraryEntry | null {
  if (!protocol || !('ProtocolId' in protocol) || !protocol.ProtocolId) return null;

  return {
    Id: protocol.ProtocolId,
    Kind: protocol.Kind ?? 0,
    Number: protocol.Number ?? null,
    CurrentVersionId: protocol.CurrentVersionId ? String(protocol.CurrentVersionId) : null,
    VersionLabel: protocol.VersionLabel ?? null,
    EffectiveOn: protocol.EffectiveOn ?? null,
    RequiresAcknowledgment: protocol.RequiresAcknowledgment === true,
    CategoryId: protocol.CategoryId ?? null,
    Attachments: entriesOf(protocol.Attachments).map((attachment) => ({
      Id: attachment.ProtocolTriggerAttachmentId ?? '',
      FileName: attachment.FileName ?? '',
      FileType: attachment.FileType ?? '',
      Size: attachment.Size ?? null,
    })),
  };
}

/** Library entries by protocol id for a wire list (screen-shape items are skipped). */
export function toLibraryEntries(list: readonly (ProtocolResultData | CallProtocolsResultData | null)[] | null | undefined): Record<string, ProtocolLibraryEntry> {
  return Object.fromEntries(
    entriesOf(list).flatMap((protocol) => {
      const entry = toLibraryEntry(protocol);

      return entry ? [[entry.Id, entry] as const] : [];
    })
  );
}
