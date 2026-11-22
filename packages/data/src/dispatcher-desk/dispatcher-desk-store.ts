import {
  acceptDispatcherItem,
  addDispatcherNote,
  assignDispatcherToDay,
  callBackDispatcherCaller,
  cancelDispatcherBreak,
  completeDispatcherItem,
  connectDispatcherVoice,
  declineDispatcherItem,
  type DispatcherCoverageQuery,
  endDispatcherBreak,
  type EndedSessionRequest,
  getDispatcherCoverage,
  getDispatcherDesk,
  getDispatcherQueueItem,
  getShiftDispatchers,
  linkDispatcherItemCall,
  planDispatcherBreaks,
  registerDispatcherDeskDevice,
  releaseDispatcherItem,
  removeDispatcherFromDay,
  saveDispatcherBreak,
  sendDispatcherDeskHeartbeat,
  sendDispatcherMessage,
  setDispatcherAvailable,
  setDispatcherAway,
  setDispatcherCallbackNumber,
  signInToDispatcherDesk,
  signOffDispatcherDesk,
  signupToDispatchForDay,
  startDispatcherBreak,
  transferDispatcherItem,
  unregisterDispatcherDeskDevice,
  unregisterDispatcherDeskDeviceForEndedSession,
  withdrawFromDispatchDay,
} from '@resgrid/api';
import type {
  DispatcherBreakData,
  DispatcherCompleteInput,
  DispatcherConversationMessageData,
  DispatcherCoverageResultData,
  DispatcherDeskActionResult,
  DispatcherDeskMemberData,
  DispatcherDeskResultData,
  DispatcherDeskWarningData,
  DispatcherDeviceInput,
  DispatcherQueueItemData,
  DispatcherQueueItemDetailData,
  DispatcherSaveBreakInput,
  DispatcherSignInInput,
  DispatcherStartBreakInput,
  ShiftDayDispatcherInput,
  ShiftDispatchersResultData,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useBadgeCountsStore } from '../badge-counts/badge-counts-store';
import { unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { createKeyedFlight } from '../core/keyed-flight';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { deskQueueCount, isDeskOutOfStep, isOpenDeskItem } from './desk-selectors';

/**
 * The dispatcher desk ("Dispatchers on duty", Dispatch, Core M0324): the board (config, the member's desk state, the other
 * dispatchers, the routed work queue, the member's breaks and the coverage counts), item details with their conversation,
 * the team's coverage timeline and shift day rosters. It is read again on every `dispatcherDeskUpdated` /
 * `dispatcherQueueUpdated` ping (id-only), after a hub rejoin and when the app returns to the foreground (the feature's
 * sync hook drives that). Every desk action is an online write, never queued: each answers the member's desk state after
 * it, which is applied at once, and the board is read again.
 *
 * Inert until the features call in (only with `capabilities.calls.dispatcherDesk`). An older Core without the desk (404)
 * sets `unsupported` and stops asking until the next sign-in. The board, coverage and recent work persist for offline
 * reads; sign-out clears them.
 */

type DeskSlice = 'desk' | 'item' | 'coverage' | 'roster';

/** What a desk action did: `refusal` is the desk's `DispatcherDeskErrors` name when it refused, `error` a failure to get an answer. */
export interface DeskActionOutcome {
  ok: boolean;
  refusal: string | null;
  error: DataError | null;
  warnings: DispatcherDeskWarningData[];
  result: DispatcherDeskActionResult | null;
}

/** A created call's server id by the desk item it waits to be linked to. */
export type PendingCallLinks = Record<string, number>;

/** The busy key of the member's own presence actions (sign in or off, away, available, breaks of their own). */
export const DESK_PRESENCE_KEY = 'presence';

/** The busy key of an item action. */
export const deskItemKey = (itemId: string): string => `item:${itemId}`;

/** The busy key of a break action on someone's break (planning, cancelling, ending another dispatcher's break). */
export const deskBreakKey = (id: string): string => `break:${id}`;

/** The busy key of a roster action on a shift day. */
export const deskRosterKey = (shiftDayId: number): string => `roster:${shiftDayId}`;

/** The rosters are kept per shift and day. */
export const shiftRosterKey = (shiftId: number, shiftDayId?: number | null): string => `${shiftId}:${shiftDayId ?? ''}`;

/** How many finished items the Recent list keeps. */
export const RECENT_DESK_ITEMS = 20;

interface DispatcherDeskData extends SliceMeta<DeskSlice> {
  desk: DispatcherDeskResultData | null;
  /** Item details (history, conversation) by item id, as last read. */
  items: Record<string, DispatcherQueueItemDetailData>;
  /** Items that left the open queue while this device watched (newest first). */
  recent: DispatcherQueueItemData[];
  coverage: DispatcherCoverageResultData | null;
  rosters: Record<string, ShiftDispatchersResultData>;
  /** The actions in flight (`presence`, `item:<id>`, `break:<id>`, `roster:<shiftDayId>`), so their buttons can spin. */
  busyKeys: string[];
  /** The server has no desk (an older Core): no requests until the next sign-in. */
  unsupported: boolean;
  /** This device's push token as the desk subscriber took it this session. */
  deskDevice: DispatcherDeviceInput | null;
  /**
   * Calls created from an item that the desk then refused (or failed) to link, by item id: the item offers to link that
   * call again instead of creating another one for the same conversation.
   */
  pendingCallLinks: PendingCallLinks;
}

export interface DispatcherDeskState extends DispatcherDeskData {
  fetchDesk: (options?: FetchOptions) => Promise<void>;
  fetchItem: (itemId: string, options?: FetchOptions) => Promise<void>;
  fetchCoverage: (query?: DispatcherCoverageQuery, options?: FetchOptions) => Promise<void>;
  fetchShiftDispatchers: (shiftId: number, shiftDayId?: number | null, options?: FetchOptions) => Promise<void>;

  signIn: (input: DispatcherSignInInput) => Promise<DeskActionOutcome>;
  signOff: () => Promise<DeskActionOutcome>;
  /** "Still here": quiet (no busy state); applies the member's desk state it answers. */
  heartbeat: () => Promise<boolean>;
  setAvailable: () => Promise<DeskActionOutcome>;
  setAway: (reason?: string | null) => Promise<DeskActionOutcome>;
  setCallbackNumber: (callbackNumber: string | null) => Promise<DeskActionOutcome>;

  accept: (itemId: string) => Promise<DeskActionOutcome>;
  decline: (itemId: string, reason?: string | null) => Promise<DeskActionOutcome>;
  release: (itemId: string) => Promise<DeskActionOutcome>;
  transfer: (itemId: string, toUserId: string, note?: string | null) => Promise<DeskActionOutcome>;
  complete: (input: DispatcherCompleteInput) => Promise<DeskActionOutcome>;
  linkCall: (itemId: string, callId: number) => Promise<DeskActionOutcome>;
  sendMessage: (itemId: string, body: string) => Promise<DeskActionOutcome>;
  addNote: (itemId: string, body: string) => Promise<DeskActionOutcome>;
  connectVoice: (itemId: string, callbackNumber?: string | null) => Promise<DeskActionOutcome>;
  callBack: (itemId: string, callbackNumber?: string | null) => Promise<DeskActionOutcome>;

  saveBreak: (input: DispatcherSaveBreakInput) => Promise<DeskActionOutcome>;
  cancelBreak: (breakId: string) => Promise<DeskActionOutcome>;
  /** Starts the member's break (presence key), or another dispatcher's as a supervisor (that dispatcher's key). */
  startBreak: (input: DispatcherStartBreakInput) => Promise<DeskActionOutcome>;
  endBreak: (userId?: string | null) => Promise<DeskActionOutcome>;
  planBreaks: (shiftDayId: number, replace: boolean) => Promise<DeskActionOutcome>;

  signupForDay: (input: ShiftDayDispatcherInput) => Promise<DeskActionOutcome>;
  withdrawFromDay: (input: ShiftDayDispatcherInput) => Promise<DeskActionOutcome>;
  assignToDay: (input: ShiftDayDispatcherInput) => Promise<DeskActionOutcome>;
  removeFromDay: (input: ShiftDayDispatcherInput) => Promise<DeskActionOutcome>;

  /** Puts this device's push token on the Dispatch-only desk subscriber (once per token this session). */
  registerDevice: (device: DispatcherDeviceInput) => Promise<boolean>;
  /** Takes it off again while signed in. */
  unregisterDevice: () => Promise<boolean>;
  /** The department or the variant has no desk: drop everything (no request is made). */
  disable: () => void;
}

const initialData = (): DispatcherDeskData => ({
  ...emptySliceMeta<DeskSlice>(),
  desk: null,
  items: {},
  recent: [],
  coverage: null,
  rosters: {},
  busyKeys: [],
  unsupported: false,
  deskDevice: null,
  pendingCallLinks: {},
});

type PersistedDesk = Pick<DispatcherDeskData, 'desk' | 'coverage' | 'recent' | 'fetchedAt' | 'pendingCallLinks'>;

let runner: SliceRunner<DeskSlice, DispatcherDeskState>;

/** One action per key: pressing again joins the one in flight. */
const writes = createKeyedFlight();

/** The token the desk subscriber took, kept apart from the store so the sign-out hook can still take it off after a reset. */
let registeredDeskDevice: DispatcherDeviceInput | null = null;

interface DeskSession {
  /** Set at sign-out: how that session reached the server, for a desk registration that lands after it. */
  signOut?: EndedSessionRequest;
}

/** The signed-in session's desk registrations; sign-out starts a new one. */
let deskSession: DeskSession = {};

/**
 * Advanced whenever an action answer applies the member's desk state: a heartbeat sent before that answer (and
 * answering after it) carries the older state and is dropped.
 */
let presenceRevision = 0;

/** Takes a device off the desk subscriber as a session that has ended (straight to the server, never the signed-in client). */
const takeOffAsEndedSession = async (request: EndedSessionRequest, device: DispatcherDeviceInput, operation: string): Promise<void> => {
  if (!(await unregisterDispatcherDeskDeviceForEndedSession(request, device))) {
    getDataLogger().warn({ message: 'The desk push subscriber could not be cleared for an ended session', context: { operation, platform: device.Platform } });
  }
};

/** Records (or with `callId` null forgets) a created call the desk did not link to its item. */
const withPendingCallLink = (links: PendingCallLinks, itemId: string, callId: number | null) => {
  if (callId === null) {
    if (!(itemId in links)) return links;
    const next = { ...links };
    delete next[itemId];

    return next;
  }

  return links[itemId] === callId ? links : { ...links, [itemId]: callId };
};

/** A fresh board settles pending links: an item that left the queue, or that has a call now, needs none. */
export const prunePendingCallLinks = (links: PendingCallLinks, queue: readonly DispatcherQueueItemData[]): PendingCallLinks => {
  const ids = Object.keys(links);

  if (ids.length === 0) return links;
  const waiting = new Set(queue.flatMap((item) => (item.CallId ? [] : [item.DispatcherQueueItemId])));
  const kept = ids.filter((id) => waiting.has(id));

  return kept.length === ids.length ? links : Object.fromEntries(kept.map((id) => [id, links[id]]));
};

const upsertItem = (list: readonly DispatcherQueueItemData[], item: DispatcherQueueItemData): DispatcherQueueItemData[] =>
  list.some((entry) => entry.DispatcherQueueItemId === item.DispatcherQueueItemId) ? list.map((entry) => (entry.DispatcherQueueItemId === item.DispatcherQueueItemId ? item : entry)) : [...list, item];

const upsertMember = (list: readonly DispatcherDeskMemberData[], member: DispatcherDeskMemberData): DispatcherDeskMemberData[] =>
  list.some((entry) => entry.UserId === member.UserId) ? list.map((entry) => (entry.UserId === member.UserId ? member : entry)) : [...list, member];

const upsertBreak = (list: readonly DispatcherBreakData[], entry: DispatcherBreakData): DispatcherBreakData[] =>
  list.some((existing) => existing.DispatcherBreakId === entry.DispatcherBreakId) ? list.map((existing) => (existing.DispatcherBreakId === entry.DispatcherBreakId ? entry : existing)) : [...list, entry];

const upsertMessage = (list: readonly DispatcherConversationMessageData[], message: DispatcherConversationMessageData): DispatcherConversationMessageData[] =>
  list.some((entry) => entry.DispatcherConversationMessageId === message.DispatcherConversationMessageId)
    ? list.map((entry) => (entry.DispatcherConversationMessageId === message.DispatcherConversationMessageId ? message : entry))
    : [...list, message];

/** Puts closed items at the front of Recent (newest first, one entry per item, at most {@link RECENT_DESK_ITEMS}). */
export const mergeRecentDeskItems = (recent: readonly DispatcherQueueItemData[], closed: readonly DispatcherQueueItemData[]): DispatcherQueueItemData[] => {
  if (closed.length === 0) return [...recent];
  const ids = new Set(closed.map((item) => item.DispatcherQueueItemId));

  return [...closed, ...recent.filter((item) => !ids.has(item.DispatcherQueueItemId))].slice(0, RECENT_DESK_ITEMS);
};

/**
 * A fresh board: open items stay in the queue; items the previous board had that are gone (or arrive closed) move to
 * Recent with their last known state.
 */
export const applyDeskBoard = (state: Pick<DispatcherDeskData, 'desk' | 'recent'>, board: DispatcherDeskResultData): Pick<DispatcherDeskData, 'desk' | 'recent'> => {
  const queue = board.Queue ?? [];
  const nextIds = new Set(queue.map((item) => item.DispatcherQueueItemId));
  const vanished = (state.desk?.Queue ?? []).filter((item) => isOpenDeskItem(item) && !nextIds.has(item.DispatcherQueueItemId));
  const closedNow = queue.filter((item) => !isOpenDeskItem(item));

  return {
    desk: { ...board, Queue: queue.filter(isOpenDeskItem), Members: board.Members ?? [], MyBreaks: board.MyBreaks ?? [] },
    recent: mergeRecentDeskItems(state.recent, [...closedNow, ...vanished]),
  };
};

/** Applies what an action answered (the member's desk state, the item, the break, the message) without waiting for a read. */
export const applyDeskActionResult = (state: DispatcherDeskData, result: DispatcherDeskActionResult, itemId?: string): Partial<DispatcherDeskData> => {
  let desk = state.desk;
  let items = state.items;
  let recent = state.recent;

  if (desk && result.Me) desk = { ...desk, Me: result.Me, Members: upsertMember(desk.Members ?? [], result.Me) };

  if (result.Item) {
    const item = result.Item;
    const id = item.DispatcherQueueItemId;

    if (desk) desk = { ...desk, Queue: isOpenDeskItem(item) ? upsertItem(desk.Queue ?? [], item) : (desk.Queue ?? []).filter((entry) => entry.DispatcherQueueItemId !== id) };

    if (!isOpenDeskItem(item)) recent = mergeRecentDeskItems(recent, [item]);

    if (items[id]) items = { ...items, [id]: { ...items[id], Item: item } };
  }

  if (desk && result.Break && result.Break.UserId === desk.Me?.UserId) desk = { ...desk, MyBreaks: upsertBreak(desk.MyBreaks ?? [], result.Break) };

  const messageItemId = itemId ?? result.Item?.DispatcherQueueItemId;

  if (result.Message && messageItemId && items[messageItemId]) {
    items = { ...items, [messageItemId]: { ...items[messageItemId], Messages: upsertMessage(items[messageItemId].Messages ?? [], result.Message) } };
  }

  return { desk, items, recent };
};

/** The desk's refusal name from an action answer (the API reads a refused 4xx request the same way); null on success. */
const refusalOf = (result: DispatcherDeskActionResult | null | undefined): string | null => {
  if (result?.Success === true) return null;

  return result?.Error?.trim() || 'Unknown';
};

export const useDispatcherDeskStore = create<DispatcherDeskState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<DeskSlice, DispatcherDeskState>('dispatcher-desk', set);

      const markUnsupported = (error: DataError | null | undefined): void => {
        if (error?.code === 'not_found') set({ unsupported: true, desk: null, items: {}, coverage: null });
      };

      /** Runs one desk write under its busy key; a second press of the same key joins it. */
      const runAction = (key: string, operation: string, write: () => Promise<DispatcherDeskActionResult>, itemId?: string): Promise<DeskActionOutcome> =>
        writes.run(key, async () => {
          // Signing out or disabling the desk ends the session the action started in: a late answer then clears no busy
          // state and starts no read that could refill the cleared store.
          const generation = runner.generation();
          set((state) => ({ busyKeys: [...state.busyKeys.filter((entry) => entry !== key), key] }));
          let outcome: DeskActionOutcome;

          try {
            const result = await write();
            const refusal = refusalOf(result);
            outcome = { ok: refusal === null, refusal, error: null, warnings: result?.Warnings ?? [], result: result ?? null };

            if (generation === runner.generation() && result) {
              if (result.Me) presenceRevision += 1;
              set((state) => applyDeskActionResult(state, result, itemId));
            }
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'A dispatcher desk action failed', context: { operation, code: dataError.code, status: dataError.status } });
            outcome = { ok: false, refusal: null, error: dataError, warnings: [], result: null };
          }

          if (generation === runner.generation()) {
            set((state) => ({ busyKeys: state.busyKeys.filter((entry) => entry !== key) }));
            void get().fetchDesk({ bypassCache: true });

            if (itemId && get().items[itemId]) void get().fetchItem(itemId, { bypassCache: true });
          }

          return outcome;
        });

      const ctx = () => getDataApiContext();

      return {
        ...initialData(),

        fetchDesk: async (options) => {
          if (get().unsupported) return;

          // A failed refresh keeps the last board: an offer must not vanish from the screen on a network blip.
          const result = await runner.run(
            'desk',
            async () => unwrapItem(await getDispatcherDesk(ctx())),
            (board, state) => (board ? { ...applyDeskBoard(state, board), pendingCallLinks: prunePendingCallLinks(state.pendingCallLinks, board.Queue ?? []) } : { desk: null }),
            {
              trailing: options?.bypassCache === true,
            }
          );

          if (!result.ok && !result.stale) markUnsupported(result.error);
        },

        fetchItem: async (itemId, options) => {
          if (get().unsupported || !itemId) return;

          await runner.run(
            'item',
            async () => unwrapItem(await getDispatcherQueueItem(ctx(), { itemId })),
            (detail, state) => (detail ? { items: { ...state.items, [itemId]: { ...detail, Events: detail.Events ?? [], Messages: detail.Messages ?? [] } } } : {}),
            { flightKey: `item:${itemId}`, raceKey: `item:${itemId}`, trailing: options?.bypassCache === true }
          );
        },

        fetchCoverage: async (query, options) => {
          if (get().unsupported) return;

          await runner.run(
            'coverage',
            async () => unwrapItem(await getDispatcherCoverage(ctx(), query ?? {})),
            (coverage) => ({ coverage }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchShiftDispatchers: async (shiftId, shiftDayId, options) => {
          if (get().unsupported) return;
          const key = shiftRosterKey(shiftId, shiftDayId);

          await runner.run(
            'roster',
            async () => unwrapItem(await getShiftDispatchers(ctx(), shiftDayId ? { shiftId, shiftDayId } : { shiftId })),
            (roster, state) => (roster ? { rosters: { ...state.rosters, [key]: roster } } : {}),
            { flightKey: `roster:${key}`, raceKey: `roster:${key}`, trailing: options?.bypassCache === true }
          );
        },

        signIn: (input) => runAction(DESK_PRESENCE_KEY, 'signIn', () => signInToDispatcherDesk(ctx(), input)),
        signOff: () => runAction(DESK_PRESENCE_KEY, 'signOff', () => signOffDispatcherDesk(ctx())),

        heartbeat: async () => {
          if (get().unsupported) return false;
          const generation = runner.generation();
          const revision = presenceRevision;

          try {
            const result = await sendDispatcherDeskHeartbeat(ctx());

            // An action answered while this heartbeat was out (an "I'm back", a sign-in): its state is newer than this one.
            if (generation === runner.generation() && revision === presenceRevision && result?.Me) {
              const me = result.Me;
              const board = get().desk;
              set((state) => applyDeskActionResult(state, { ...result, Item: null, Break: null, Message: null }));

              // A missed realtime event: the server has work for the member the board doesn't show (or no longer has). With
              // an offer out the board is read anyway: one offer the server replaced with another leaves the counts equal.
              if (board && (isDeskOutOfStep(board.Queue ?? [], me) || me.OfferedItemCount > 0)) void get().fetchDesk({ bypassCache: true });
            }

            return result?.Success === true;
          } catch (error) {
            const dataError = toDataError(error);

            if (generation === runner.generation()) markUnsupported(dataError);

            return false;
          }
        },

        setAvailable: () => runAction(DESK_PRESENCE_KEY, 'setAvailable', () => setDispatcherAvailable(ctx())),
        setAway: (reason) => runAction(DESK_PRESENCE_KEY, 'setAway', () => setDispatcherAway(ctx(), { Reason: reason?.trim() || null })),
        setCallbackNumber: (callbackNumber) => runAction(DESK_PRESENCE_KEY, 'setCallbackNumber', () => setDispatcherCallbackNumber(ctx(), { CallbackNumber: callbackNumber?.trim() || null })),

        accept: (itemId) => runAction(deskItemKey(itemId), 'accept', () => acceptDispatcherItem(ctx(), { ItemId: itemId }), itemId),
        decline: (itemId, reason) => runAction(deskItemKey(itemId), 'decline', () => declineDispatcherItem(ctx(), { ItemId: itemId, Reason: reason?.trim() || null }), itemId),
        release: (itemId) => runAction(deskItemKey(itemId), 'release', () => releaseDispatcherItem(ctx(), { ItemId: itemId }), itemId),
        transfer: (itemId, toUserId, note) => runAction(deskItemKey(itemId), 'transfer', () => transferDispatcherItem(ctx(), { ItemId: itemId, ToUserId: toUserId, Note: note?.trim() || null }), itemId),
        complete: (input) => runAction(deskItemKey(input.ItemId), 'complete', () => completeDispatcherItem(ctx(), { ...input, Note: input.Note?.trim() || null }), input.ItemId),
        linkCall: async (itemId, callId) => {
          const generation = runner.generation();
          const outcome = await runAction(deskItemKey(itemId), 'linkCall', () => linkDispatcherItemCall(ctx(), { ItemId: itemId, CallId: callId }), itemId);

          // A link the desk did not make is kept, so the item links this call again rather than creating a second one.
          if (generation === runner.generation()) set((state) => ({ pendingCallLinks: withPendingCallLink(state.pendingCallLinks, itemId, outcome.ok ? null : callId) }));

          return outcome;
        },
        sendMessage: (itemId, body) => runAction(deskItemKey(itemId), 'sendMessage', () => sendDispatcherMessage(ctx(), { ItemId: itemId, Body: body.trim() }), itemId),
        addNote: (itemId, body) => runAction(deskItemKey(itemId), 'addNote', () => addDispatcherNote(ctx(), { ItemId: itemId, Body: body.trim() }), itemId),
        connectVoice: (itemId, callbackNumber) => runAction(deskItemKey(itemId), 'connectVoice', () => connectDispatcherVoice(ctx(), { ItemId: itemId, CallbackNumber: callbackNumber?.trim() || null }), itemId),
        callBack: (itemId, callbackNumber) => runAction(deskItemKey(itemId), 'callBack', () => callBackDispatcherCaller(ctx(), { ItemId: itemId, CallbackNumber: callbackNumber?.trim() || null }), itemId),

        saveBreak: (input) => runAction(deskBreakKey(input.DispatcherBreakId || `new:${input.UserId ?? ''}`), 'saveBreak', () => saveDispatcherBreak(ctx(), input)),
        cancelBreak: (breakId) => runAction(deskBreakKey(breakId), 'cancelBreak', () => cancelDispatcherBreak(ctx(), { DispatcherBreakId: breakId })),
        startBreak: (input) => runAction(input.UserId ? deskBreakKey(`user:${input.UserId}`) : DESK_PRESENCE_KEY, 'startBreak', () => startDispatcherBreak(ctx(), input)),
        endBreak: (userId) => runAction(userId ? deskBreakKey(`user:${userId}`) : DESK_PRESENCE_KEY, 'endBreak', () => endDispatcherBreak(ctx(), { UserId: userId || null })),
        planBreaks: (shiftDayId, replace) => runAction(deskRosterKey(shiftDayId), 'planBreaks', () => planDispatcherBreaks(ctx(), { ShiftDayId: shiftDayId, Replace: replace })),

        signupForDay: (input) => runAction(deskRosterKey(input.ShiftDayId), 'signupForDay', () => signupToDispatchForDay(ctx(), input)),
        withdrawFromDay: (input) => runAction(deskRosterKey(input.ShiftDayId), 'withdrawFromDay', () => withdrawFromDispatchDay(ctx(), input)),
        assignToDay: (input) => runAction(deskRosterKey(input.ShiftDayId), 'assignToDay', () => assignDispatcherToDay(ctx(), input)),
        removeFromDay: (input) => runAction(deskRosterKey(input.ShiftDayId), 'removeFromDay', () => removeDispatcherFromDay(ctx(), input)),

        registerDevice: async (device) => {
          if (get().unsupported || !device.Token) return false;
          const current = get().deskDevice;

          // Already on the desk subscriber this session.
          if (current && current.Token === device.Token && current.Platform === device.Platform) return true;
          const generation = runner.generation();
          const session = deskSession;
          const taken: DispatcherDeviceInput = { Platform: device.Platform, Token: device.Token };

          try {
            const result = await registerDispatcherDeskDevice(ctx(), device);
            const accepted = result?.Success === true;

            if (session !== deskSession) {
              // Signed out while the request was out: sign-out could not take off what had not landed yet. Take it off now
              // as the session that ended, so the next person on the device never gets this dispatcher's desk pushes.
              if (accepted && session.signOut) await takeOffAsEndedSession(session.signOut, taken, 'registerDevice');

              return false;
            }

            if (!accepted) return false;
            // Recorded even when the desk was switched off meanwhile: sign-out still takes it off.
            registeredDeskDevice = taken;

            if (generation !== runner.generation()) return false;
            set({ deskDevice: taken });

            return true;
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({
              message: 'The desk push subscriber did not take this device',
              context: { operation: 'registerDevice', platform: device.Platform, code: dataError.code, status: dataError.status },
            });

            if (generation === runner.generation()) markUnsupported(dataError);

            return false;
          }
        },

        unregisterDevice: async () => {
          const device = get().deskDevice;

          if (!device) return true;

          try {
            const result = await unregisterDispatcherDeskDevice(ctx(), device);
            const removed = result?.Success === true;

            // Only what this call took off: a registration that replaced it while the request was out stays recorded.
            if (removed && registeredDeskDevice === device) registeredDeskDevice = null;

            if (removed && get().deskDevice === device) set({ deskDevice: null });

            return removed;
          } catch {
            return false;
          }
        },

        disable: () => {
          runner.invalidate();
          writes.clear();
          set(initialData());
        },
      };
    },
    dataPersistOptions<DispatcherDeskState, PersistedDesk>({
      name: 'omni-dispatcher-desk-storage',
      partialize: (state) => ({ desk: state.desk, coverage: state.coverage, recent: state.recent, fetchedAt: state.fetchedAt, pendingCallLinks: state.pendingCallLinks }),
    })
  )
);

/**
 * Sign-out (the auth sign-out hook, as the ended session): takes this device's token off the desk subscriber so the next
 * person on the device never gets the previous dispatcher's desk pushes. A registration still out keeps the ended
 * session's credentials and takes itself off when it lands. Nothing to do when the desk never took the device.
 */
export const unregisterDispatcherDeskDeviceAtSignOut = async (session: { accessToken: string | null; baseUrl: string }): Promise<void> => {
  const ended = deskSession;
  const request: EndedSessionRequest | null = session.accessToken && session.baseUrl ? { accessToken: session.accessToken, baseUrl: session.baseUrl } : null;

  deskSession = {};

  if (request) ended.signOut = request;
  const device = registeredDeskDevice;
  registeredDeskDevice = null;

  if (!device || !request) return;
  await takeOffAsEndedSession(request, device, 'signOut');
};

registerPersistedStore('omni-dispatcher-desk-storage', useDispatcherDeskStore);

registerDataStoreReset<DispatcherDeskState>('dispatcher-desk', useDispatcherDeskStore, initialData, () => {
  runner.invalidate();
  writes.clear();
});

// The menu's desk badge counts the offers waiting for the member and the work waiting in the shared queue.
useDispatcherDeskStore.subscribe((state, previous) => {
  if (state.desk !== previous.desk) useBadgeCountsStore.getState().setDeskQueue(deskQueueCount(state.desk));
});

// A board restored before the subscription existed counts too.
useBadgeCountsStore.getState().setDeskQueue(deskQueueCount(useDispatcherDeskStore.getState().desk));

/** Test hook: forgets the device the desk subscriber took and starts a new session. */
export const resetDispatcherDeskDeviceForTests = (): void => {
  registeredDeskDevice = null;
  deskSession = {};
};
