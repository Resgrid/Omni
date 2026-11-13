import { getNearestUnits } from '@resgrid/api';
import type { NearestUnitBoard } from '@resgrid/models';
import { create } from 'zustand';

import { type Enveloped, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';

/**
 * The nearest-unit board for a call location (Dispatch baseline `stores/dispatch` board slice): every unit and responder
 * the dispatcher may send, ranked by Core (`/Dispatch/GetNearestUnits`) available first, then response time to the
 * second, then distance. The dispatch picker orders its rows by it and badges the closest; the location picker draws it.
 * Nothing is dispatched by fetching it. Not persisted: a board is only true for the moment and the spot it was asked for.
 */

/** A board for the same spot younger than this is reused rather than asked for again. */
export const BOARD_MAX_AGE_MS = 30 * 1000;

/** The spot a board belongs to: 5 decimal places (about a metre), so a pin nudged by rounding reuses it. */
export const boardKeyFor = (latitude: number, longitude: number): string => `${latitude.toFixed(5)},${longitude.toFixed(5)}`;

interface DispatchBoardData {
  board: NearestUnitBoard | null;
  boardKey: string | null;
  isBoardLoading: boolean;
  boardError: DataError | null;
}

export interface DispatchBoardState extends DispatchBoardData {
  /** Loads the board for a call location; reuses a board for the same spot younger than BOARD_MAX_AGE_MS unless forced. */
  fetchNearestBoard: (latitude: number, longitude: number, force?: boolean) => Promise<void>;
  clearNearestBoard: () => void;
}

const initialData = (): DispatchBoardData => ({ board: null, boardKey: null, isBoardLoading: false, boardError: null });

const isUsableLocation = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0);

let inFlight: AbortController | null = null;
let fetchedAt = 0;
let generation = 0;

export const useDispatchBoardStore = create<DispatchBoardState>()((set, get) => ({
  ...initialData(),

  fetchNearestBoard: async (latitude, longitude, force = false) => {
    if (!isUsableLocation(latitude, longitude)) return;

    const key = boardKeyFor(latitude, longitude);
    const { boardKey, board, isBoardLoading } = get();
    const fresh = board !== null && Date.now() - fetchedAt < BOARD_MAX_AGE_MS;

    if (!force && key === boardKey && (isBoardLoading || fresh)) return;

    // A newer location wins: the board for a spot the dispatcher has moved away from is thrown away.
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    const startedIn = generation;

    // The same spot keeps its board on screen while it refreshes; a new spot clears it.
    set(key === boardKey ? { boardKey: key, isBoardLoading: true, boardError: null } : { boardKey: key, isBoardLoading: true, boardError: null, board: null });

    try {
      const response = await getNearestUnits(getDataApiContext(), { latitude, longitude }, { signal: controller.signal });
      // SAFETY: GetNearestUnitsResult is the v4 envelope (Data + Status); unwrapItem checks Status and returns null for a missing Data.
      const result = unwrapItem(response as Enveloped<NearestUnitBoard>);

      if (inFlight !== controller || startedIn !== generation) return;
      inFlight = null;
      fetchedAt = Date.now();
      set({ board: result, isBoardLoading: false });
    } catch (error) {
      if (controller.signal.aborted || inFlight !== controller || startedIn !== generation) return;
      inFlight = null;
      const dataError = toDataError(error);

      getDataLogger().warn({ message: 'Nearest unit board failed', context: { code: dataError.code, status: dataError.status } });
      // Never block dispatching: the picker falls back to the plain lists by name.
      set({ isBoardLoading: false, boardError: dataError });
    }
  },

  clearNearestBoard: () => {
    inFlight?.abort();
    inFlight = null;
    fetchedAt = 0;
    set(initialData());
  },
}));

registerDataStoreReset<DispatchBoardState>('dispatch-board', useDispatchBoardStore, initialData, () => {
  generation++;
  inFlight?.abort();
  inFlight = null;
  fetchedAt = 0;
});
