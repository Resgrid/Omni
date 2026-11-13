import { useCapability } from '@resgrid/config';
import { boardKeyFor, personnelFullName, useDispatchBoardStore } from '@resgrid/data';
import { isStaffingOnDuty, isStatusAvailable } from '@resgrid/features/status/lib/base-types';
import { useTranslation } from '@resgrid/i18n';
import type { NearestPersonnelResult, NearestUnitResult, PersonnelInfoResultData, UnitResultData } from '@resgrid/models';
import { Switch, Text } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DispatchRecipients } from '../hooks/use-call-form-data';
import { type DispatchSelection, EMPTY_DISPATCH_SELECTION } from '../lib/call-form';
import { type BoardRank, formatDistanceEta, NEAREST_BADGE_COUNT, orderByBoard, positionNote, rankBoardPersonnel, rankBoardUnits, type RecipientSort, unitResponseSeconds } from '../lib/dispatch-board';
import { DISPATCH_LIST_BUCKETS, type DispatchListBucket } from '../lib/dispatch-selection';
import { pickedIds, type RecipientPickerBadge, type RecipientPickerEntry, type RecipientPickerSection, type RecipientPickerSelection, summarizeRecipientSelection } from '../lib/recipient-picker';
import { OptionChips } from './option-chips';
import { RecipientPickerModal } from './recipient-picker';

type Section = DispatchListBucket;

/** Resources a run card proposes for this call: they get a "Run card" badge in the picker. */
export interface DispatchRecommendedIds {
  units: readonly string[];
  users: readonly string[];
}

export interface DispatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: DispatchRecipients;
  value: DispatchSelection;
  onConfirm: (selection: DispatchSelection) => void;
  /** "Everyone" is not offered for pending calls: the dispatcher who sends one picks its recipients. */
  allowEveryone?: boolean;
  /**
   * Where the call is. With `capabilities.calls.nearestBoard` the picker ranks personnel and units by response time to it
   * (`/Dispatch/GetNearestUnits`), badges the closest and shows distance, ETA and status; without one it lists by name.
   */
  callLocation?: { latitude: number; longitude: number } | null;
  recommended?: DispatchRecommendedIds | null;
  /**
   * The recipient lists offered (`shownDispatchLists`: the New Call Form Fields policy can hide each one); all four by
   * default. Picks of a hidden list's kind stay in the selection, so confirming keeps them. With no list at all the picker
   * is only its "Everyone" switch, offered as All Call.
   */
  lists?: readonly Section[];
  /** With no list offered: what confirming with All Call off does (shown under the switch). */
  allCallHint?: string | null;
}

const SECTIONS: readonly Section[] = DISPATCH_LIST_BUCKETS;

const SECTION_KEYS: Record<Section, string> = { users: 'calls.users', groups: 'calls.groups', roles: 'calls.roles', units: 'calls.units' };

const SORT_OPTIONS: readonly RecipientSort[] = ['closest', 'name'];

/** The picker's entries for a call's possible recipients: personnel by full name, roles in their sort order. */
function dispatchEntries(recipients: DispatchRecipients): Record<Section, RecipientPickerEntry[]> {
  return {
    users: recipients.personnel.map((person) => ({ id: person.UserId, name: personnelFullName(person) || person.UserId, detail: person.GroupName })),
    groups: recipients.groups.map((group) => ({ id: group.GroupId, name: group.Name })),
    roles: [...recipients.roles].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)).map((role) => ({ id: role.RoleId, name: role.Name })),
    units: recipients.units.map((unit) => ({ id: unit.UnitId, name: unit.Name, detail: unit.GroupName || unit.Type })),
  };
}

/** A base type the server did not send (an older server) does not hide anyone. */
const availableBy = (baseType: number | null | undefined, rule: (baseType: number) => boolean): boolean => baseType === null || baseType === undefined || rule(baseType);

/** Whether a person can take the call: the board's answer when it lists them, else their status (and staffing). */
const isPersonAvailable = (person: PersonnelInfoResultData, rank: BoardRank<NearestPersonnelResult> | undefined): boolean =>
  rank ? rank.entry.IsAvailable : availableBy(person.StatusBaseType, isStatusAvailable) && availableBy(person.StaffingBaseType, isStaffingOnDuty);

/** The units list carries no status meaning, so a unit the board does not list counts as available. */
const isUnitAvailable = (rank: BoardRank<NearestUnitResult> | undefined): boolean => (rank ? rank.entry.IsAvailable : true);

const toPickerSelection = (value: DispatchSelection): RecipientPickerSelection<Section> => ({ everyone: value.everyone, ids: { users: value.users, groups: value.groups, roles: value.roles, units: value.units } });

const fromPickerSelection = (value: RecipientPickerSelection<Section>): DispatchSelection =>
  value.everyone
    ? { ...EMPTY_DISPATCH_SELECTION, everyone: true }
    : { everyone: false, users: [...pickedIds(value, 'users')], groups: [...pickedIds(value, 'groups')], roles: [...pickedIds(value, 'roles')], units: [...pickedIds(value, 'units')] };

/**
 * Who to dispatch (R + D selection): personnel, groups, roles and units in the shared recipient picker, with an "Everyone"
 * switch. In the Dispatch app (`capabilities.calls.nearestBoard`) and once the call has a location, it is the nearest-unit
 * board as well: rows closest first by response time (Core ranks to the second), "Nearest #n" on the closest available,
 * distance and ETA, status and staffing in the department's colours, crew, stale or hidden positions, and "Run card" on
 * what the run card proposes. A department can hide each list (`lists`); with all four hidden only All Call is left.
 */
export const DispatchSelectionModal: React.FC<DispatchSelectionModalProps> = ({
  isOpen,
  onClose,
  recipients,
  value,
  onConfirm,
  allowEveryone = true,
  callLocation = null,
  recommended = null,
  lists = SECTIONS,
  allCallHint = null,
}) => {
  const { t } = useTranslation();
  const calls = useCapability('calls');
  const allCallOnly = lists.length === 0;
  // The board ranks personnel and units; with both lists hidden there is nothing for it to rank.
  const boardEnabled = calls.nearestBoard && (lists.includes('users') || lists.includes('units'));
  const board = useDispatchBoardStore((state) => state.board);
  const boardKey = useDispatchBoardStore((state) => state.boardKey);
  const isBoardLoading = useDispatchBoardStore((state) => state.isBoardLoading);
  const boardError = useDispatchBoardStore((state) => state.boardError);
  const fetchNearestBoard = useDispatchBoardStore((state) => state.fetchNearestBoard);
  const [sort, setSort] = useState<RecipientSort>('closest');
  const [availableOnly, setAvailableOnly] = useState(false);

  const latitude = callLocation?.latitude ?? null;
  const longitude = callLocation?.longitude ?? null;

  useEffect(() => {
    if (isOpen && boardEnabled && latitude !== null && longitude !== null) void fetchNearestBoard(latitude, longitude);
  }, [isOpen, boardEnabled, latitude, longitude, fetchNearestBoard]);

  // Only the board for this call's spot counts: one left from another call would rank the wrong people.
  const currentBoard = boardEnabled && latitude !== null && longitude !== null && boardKey === boardKeyFor(latitude, longitude) ? board : null;

  const sections = useMemo<RecipientPickerSection<Section>[]>(() => {
    const entries = dispatchEntries(recipients);
    const shown = SECTIONS.filter((key) => lists.includes(key));

    if (!boardEnabled) return shown.map((key) => ({ key, label: t(SECTION_KEYS[key]), entries: entries[key] }));

    const personRanks = rankBoardPersonnel(currentBoard);
    const unitRanks = rankBoardUnits(currentBoard);
    const runCardUsers = new Set(recommended?.users ?? []);
    const runCardUnits = new Set(recommended?.units ?? []);

    const badgesFor = (nearestRank: number | null | undefined, isRunCardPick: boolean): RecipientPickerBadge[] => [
      ...(nearestRank && nearestRank <= NEAREST_BADGE_COUNT ? [{ label: t('calls.dispatch_board.nearest', { rank: nearestRank }), tone: 'nearest' as const }] : []),
      ...(isRunCardPick ? [{ label: t('calls.dispatch_board.run_card_pick'), tone: 'runCard' as const }] : []),
    ];

    const noteFor = (note: ReturnType<typeof positionNote>): string | null => (note ? t(note.key, note.values) : null);

    const people = orderByBoard(
      recipients.personnel,
      (person) => person.UserId,
      (person) => personnelFullName(person) || person.UserId,
      personRanks,
      sort
    ).map((person): RecipientPickerEntry => {
      const rank = personRanks.get(person.UserId);
      const entry = rank?.entry;
      const available = isPersonAvailable(person, rank);
      const roles = entry?.Roles?.length ? entry.Roles : person.Roles;

      return {
        id: person.UserId,
        name: personnelFullName(person) || person.UserId,
        detail: [entry?.GroupName || person.GroupName, (roles ?? []).join(', '), entry?.UnitName ? t('calls.dispatch_board.on_unit', { unit: entry.UnitName }) : null].filter(Boolean).join(' · ') || null,
        badges: badgesFor(rank?.nearestRank, runCardUsers.has(person.UserId)),
        metric: entry ? formatDistanceEta(entry.DistanceMeters, entry.EtaSeconds, entry.EtaSource) : null,
        chips: [
          { label: entry?.StatusText || person.Status, color: entry?.StatusColor || person.StatusColor },
          { label: entry?.StaffingText || person.Staffing, color: entry?.StaffingColor || person.StaffingColor },
        ].filter((chip) => !!chip.label),
        note: entry ? noteFor(positionNote(entry)) : null,
        muted: !available,
        hiddenUnlessPicked: availableOnly && !available,
      };
    });

    const units = orderByBoard(
      recipients.units,
      (unit: UnitResultData) => unit.UnitId,
      (unit) => unit.Name,
      unitRanks,
      sort
    ).map((unit): RecipientPickerEntry => {
      const rank = unitRanks.get(unit.UnitId);
      const entry = rank?.entry;
      const available = isUnitAvailable(rank);
      const turnout = entry && entry.TurnoutSeconds > 0 && entry.ResponseSeconds !== null && entry.ResponseSeconds !== undefined ? t('calls.dispatch_board.includes_turnout', { seconds: entry.TurnoutSeconds }) : null;
      const crew = entry?.Crew ?? [];

      return {
        id: unit.UnitId,
        name: unit.Name,
        detail: [entry?.UnitType || unit.Type, entry?.GroupName || unit.GroupName, turnout].filter(Boolean).join(' · ') || null,
        subDetail: entry ? (crew.length ? t('calls.dispatch_board.crew', { names: crew.join(', ') }) : t('calls.dispatch_board.no_crew')) : null,
        badges: badgesFor(rank?.nearestRank, runCardUnits.has(unit.UnitId)),
        // A unit shows the time it is ranked on: turnout plus travel.
        metric: entry ? formatDistanceEta(entry.DistanceMeters, unitResponseSeconds(entry), entry.EtaSource) : null,
        chips: entry?.StatusText ? [{ label: entry.StatusText, color: entry.StatusColor }] : [],
        note: entry ? noteFor(positionNote(entry)) : null,
        muted: !available,
        hiddenUnlessPicked: availableOnly && !available,
      };
    });

    const byKey: Record<Section, RecipientPickerEntry[]> = { ...entries, users: people, units };

    return shown.map((key) => ({ key, label: t(SECTION_KEYS[key]), entries: byKey[key] }));
  }, [recipients, t, lists, boardEnabled, currentBoard, recommended, sort, availableOnly]);

  const selection = useMemo(() => toPickerSelection(value), [value]);

  const hint = !boardEnabled
    ? null
    : latitude === null || longitude === null
      ? t('calls.dispatch_board.set_location_to_rank')
      : isBoardLoading && !currentBoard
        ? t('calls.dispatch_board.loading_board')
        : boardError && !currentBoard
          ? t('calls.dispatch_board.board_error')
          : t('calls.dispatch_board.ranked_from_location');

  const header = boardEnabled ? (
    <View style={styles.header} testID="dispatch-selection-board">
      <View style={styles.controls}>
        <OptionChips
          options={SORT_OPTIONS.map((option) => ({ value: option, label: t(option === 'closest' ? 'calls.dispatch_board.sort_closest' : 'calls.dispatch_board.sort_name') }))}
          selected={[sort]}
          onToggle={setSort}
          accessibilityLabel={t('calls.dispatch_board.sort_closest')}
          testID="dispatch-selection-sort"
        />
        <View style={styles.filter}>
          <Text size="sm" className="mr-2 text-typography-700">
            {t('calls.dispatch_board.available_only')}
          </Text>
          <Switch value={availableOnly} onValueChange={setAvailableOnly} accessibilityLabel={t('calls.dispatch_board.available_only')} testID="dispatch-selection-available-only" />
        </View>
      </View>
      {hint ? (
        <Text size="xs" className="text-typography-500" testID="dispatch-selection-hint">
          {hint}
        </Text>
      ) : null}
    </View>
  ) : allCallOnly && allCallHint ? (
    <Text size="xs" className="mb-2 text-typography-500" testID="dispatch-selection-all-call-hint">
      {allCallHint}
    </Text>
  ) : null;

  return (
    <RecipientPickerModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('calls.select_dispatch_recipients')}
      sections={sections}
      value={selection}
      onConfirm={(next) => onConfirm(fromPickerSelection(next))}
      everyoneLabel={allowEveryone ? t(allCallOnly ? 'calls.all_call_dispatch_everyone' : 'calls.dispatch_to_everyone') : null}
      everyoneName={t(allCallOnly ? 'calls.all_call' : 'calls.everyone')}
      header={header}
      testID="dispatch-selection"
      optionTestID="dispatch-option"
    />
  );
};

/** One-line summary of a dispatch selection for the form ("Everyone" / "Engine 1, Station 2 +3"). */
export function summarizeDispatchSelection(value: DispatchSelection, recipients: DispatchRecipients, labels: { everyone: string; none: string }): string {
  const entries = dispatchEntries(recipients);

  return summarizeRecipientSelection(
    toPickerSelection(value),
    SECTIONS.map((key) => ({ key, entries: entries[key] })),
    labels
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  filter: { flexDirection: 'row', alignItems: 'center' },
});
