/**
 * "Suggest and fill" on the call form (destination suggestions mode 2, Core setting 127): an empty destination takes the
 * best suggested one and follows later changes of the call's type, priority or location, until the dispatcher picks or
 * clears a destination by hand. Same rules as the web call form (`resgrid.dispatch.destinations.js`):
 * - only a new call, only while the destination is a POI (never over an address, a point or a route's end);
 * - a destination already there when the form opens is the dispatcher's, and so is any destination this did not fill;
 * - when nothing meets the requirements any more, or the suggestions for new inputs cannot be had, the destination this
 *   filled is taken back out;
 * - a pick or clear by hand stops it for the form's session, across switches of the destination kind.
 */
import { DestinationSuggestionModes } from '@resgrid/models';

export interface DestinationFillState {
  /** The destination POI this filled in last; null when the field holds none of ours. */
  autoFilledId: number | null;
  /** The dispatcher picked or cleared a destination by hand: no more filling on this form. */
  touched: boolean;
}

/** A form opening with a destination already set belongs to the dispatcher. */
export const initialDestinationFillState = (selectedPoiId: number | null): DestinationFillState => ({ autoFilledId: null, touched: selectedPoiId !== null });

/** The form's destination changed: anything other than what this filled in is the dispatcher's own choice. */
export const observeDestinationChange = (state: DestinationFillState, selectedPoiId: number | null): DestinationFillState => {
  if (selectedPoiId !== null && selectedPoiId === state.autoFilledId) return state;

  if (selectedPoiId === null && state.autoFilledId === null) return state;

  return { autoFilledId: null, touched: true };
};

/**
 * The destination POI field shows (again): the form keeps the fill state for its whole session, and switching the
 * destination kind to an address or point and back unmounts the field. A pick or clear by hand before the switch still
 * stops the filling; the switch itself took out only what this filled in, which is then simply no longer there. Null is a
 * form whose field shows for the first time.
 */
export const resumeDestinationFill = (state: DestinationFillState | null, selectedPoiId: number | null): DestinationFillState => {
  if (state === null) return initialDestinationFillState(selectedPoiId);

  if (selectedPoiId === null) return state.autoFilledId === null ? state : { ...state, autoFilledId: null };

  return observeDestinationChange(state, selectedPoiId);
};

export interface DestinationFillInput {
  /** The form may fill (a new call whose destination is a POI and holds no free location or route end). */
  enabled: boolean;
  /** The department's suggestions mode from the answer. */
  mode: number | null | undefined;
  selectedPoiId: number | null;
  /** The answer's suggestion; null when nothing meets the requirements. */
  suggestedPoiId: number | null | undefined;
  /** The suggestion is one the destination field can show (the form's destination list holds it). */
  isSelectable: (poiId: number) => boolean;
}

export type DestinationFillAction = { kind: 'none' } | { kind: 'fill'; poiId: number } | { kind: 'clear' };

/** What to do with the destination after a suggestion answer, and the fill state after it. */
export interface DestinationFillDecision {
  action: DestinationFillAction;
  state: DestinationFillState;
}

/** What to do with the destination after a suggestion answer, and the state after it. */
export const decideDestinationFill = (state: DestinationFillState, input: DestinationFillInput): DestinationFillDecision => {
  const none: DestinationFillDecision = { action: { kind: 'none' }, state };

  if (!input.enabled || Number(input.mode) !== DestinationSuggestionModes.SuggestAndFill || state.touched) return none;

  // Someone else's destination (a route's end, a pick before the first answer): never overwritten.
  if (input.selectedPoiId !== null && input.selectedPoiId !== state.autoFilledId) return none;

  const suggested = input.suggestedPoiId ?? null;

  if (suggested !== null && input.isSelectable(suggested)) {
    return input.selectedPoiId === suggested ? { action: { kind: 'none' }, state: { ...state, autoFilledId: suggested } } : { action: { kind: 'fill', poiId: suggested }, state: { ...state, autoFilledId: suggested } };
  }

  // Nothing meets the requirements now: the earlier fill no longer fits.
  return withdrawDestinationFill(state, input.selectedPoiId);
};

/**
 * The suggestions for the form's current type, priority and location could not be had (the re-ask failed): the
 * destination this filled in was the answer for earlier inputs, so it is taken back out (as the web does once the inputs
 * change). Anything the dispatcher chose stays.
 */
export const withdrawDestinationFill = (state: DestinationFillState, selectedPoiId: number | null): DestinationFillDecision => {
  if (selectedPoiId !== null && selectedPoiId === state.autoFilledId) return { action: { kind: 'clear' }, state: { ...state, autoFilledId: null } };

  return { action: { kind: 'none' }, state };
};
