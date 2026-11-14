/** A small pill beside an entry's name: "Nearest #1", "Run card". */
export interface RecipientPickerBadge {
  label: string;
  tone: 'nearest' | 'runCard';
}

/** A status or staffing label in the department's colour. */
export interface RecipientPickerChip {
  label: string;
  color?: string | null;
}

/** One person, group, role or unit a recipient picker offers. */
export interface RecipientPickerEntry {
  id: string;
  name: string;
  /** Second line (a person's group, a unit's station or type); also searched. */
  detail?: string | null;
  /** Further line (a unit's crew, a person's roles). */
  subDetail?: string | null;
  badges?: readonly RecipientPickerBadge[];
  /** Right-aligned figure: distance and ETA to the call. */
  metric?: string | null;
  chips?: readonly RecipientPickerChip[];
  /** A warning about the entry's data (a stale or hidden position). */
  note?: string | null;
  /** Shown dimmed: it cannot take the assignment right now (it can still be picked). */
  muted?: boolean;
  /** Left out of the list (an "available only" filter) unless it is picked: a pick never disappears from view. */
  hiddenUnlessPicked?: boolean;
}

/**
 * What a screen reader says for an entry: the row is one checkbox named by this label, so it carries everything the row
 * shows — name, badges, metric, detail, chips, the further line and the warning note.
 */
export const recipientEntrySpokenLabel = (entry: RecipientPickerEntry): string =>
  [entry.name, ...(entry.badges ?? []).map((badge) => badge.label), entry.metric, entry.detail, ...(entry.chips ?? []).map((chip) => chip.label), entry.subDetail, entry.note]
    .filter((part): part is string => !!part)
    .join(', ');

/** Whether a picker lists an entry: everything, apart from a filtered-out entry nobody picked. */
export const isRecipientListed = (entry: RecipientPickerEntry, picked: readonly string[]): boolean => !entry.hiddenUnlessPicked || picked.includes(entry.id);

/** A titled list in the picker; `key` names the bucket the section's picks are kept in. */
export interface RecipientPickerSection<K extends string> {
  key: K;
  label: string;
  entries: readonly RecipientPickerEntry[];
}

/** What a recipient picker holds: "everyone" (its own switch, which clears the rest) or the ids picked in each section. */
export interface RecipientPickerSelection<K extends string> {
  everyone: boolean;
  ids: Partial<Record<K, readonly string[]>>;
}

export const emptyRecipientSelection = <K extends string>(): RecipientPickerSelection<K> => ({ everyone: false, ids: {} });

export const everyoneRecipientSelection = <K extends string>(): RecipientPickerSelection<K> => ({ everyone: true, ids: {} });

/**
 * The selection as a picker may hold it: where "everyone" is not offered (a pending call's dispatch) a selection that
 * arrives with it loses it, so Done can never send everyone through a switch the user cannot see.
 */
export const offeredRecipientSelection = <K extends string>(selection: RecipientPickerSelection<K>, everyoneOffered: boolean): RecipientPickerSelection<K> =>
  everyoneOffered || !selection.everyone ? selection : { ...selection, everyone: false };

export const pickedIds = <K extends string>(selection: RecipientPickerSelection<K>, key: NoInfer<K>): readonly string[] => selection.ids[key] ?? [];

/** Picks across the given sections; "everyone" is not counted here. */
export const pickedCount = <K extends string>(selection: RecipientPickerSelection<K>, sections: readonly Pick<RecipientPickerSection<K>, 'key'>[]): number =>
  sections.reduce((total, section) => total + pickedIds(selection, section.key).length, 0);

/** Picks or unpicks one entry; any individual pick ends an "everyone" selection. */
export function toggleRecipient<K extends string>(selection: RecipientPickerSelection<K>, key: NoInfer<K>, id: string): RecipientPickerSelection<K> {
  const current = pickedIds(selection, key);
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];

  return { everyone: false, ids: { ...selection.ids, [key]: next } };
}

/** Search on the name and the second line, ignoring case; an empty query matches everything. */
export const matchesRecipientQuery = (entry: RecipientPickerEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();

  return !needle || entry.name.toLowerCase().includes(needle) || (entry.detail ?? '').toLowerCase().includes(needle);
};

/** One line for the form ("Everyone" / "Engine 1, Station 2, Medics +3"); an id no section lists any more shows as itself. */
export function summarizeRecipientSelection<K extends string>(
  selection: RecipientPickerSelection<K>,
  sections: readonly Pick<RecipientPickerSection<K>, 'key' | 'entries'>[],
  labels: { everyone: string; none: string }
): string {
  if (selection.everyone) return labels.everyone;
  const names = sections.flatMap((section) => pickedIds(selection, section.key).map((id) => section.entries.find((entry) => entry.id === id)?.name ?? id));

  if (names.length === 0) return labels.none;

  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}
