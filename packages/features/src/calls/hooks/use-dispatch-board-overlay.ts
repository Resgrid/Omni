import { useCapability } from '@resgrid/config';
import { boardKeyFor, useDispatchBoardStore } from '@resgrid/data';
import { useEffect, useMemo } from 'react';

import { buildDispatchMapOverlay, type DispatchMapOverlay } from '../lib/dispatch-board';

type BoundaryGroup = { GroupId: string; Name: string; Geofence?: string | null; GeofenceColor?: string | null };

/**
 * The nearest-unit board as map data for a call location (Dispatch baseline `useDispatchMapOverlay`): the available
 * resources it placed and the group boundaries. Null when there is nothing to draw, no location, or the app has no
 * nearest-unit board (`capabilities.calls.nearestBoard`). Loads the board for the spot; the store reuses a fresh one, so
 * the dispatch picker and the map ask once. The calls module never draws maps itself: the app's location picker renders
 * this through the `LocationPicker` hook point.
 */
export function useDispatchBoardOverlay(location: { latitude: number; longitude: number } | null, groups: readonly BoundaryGroup[], enabled: boolean): DispatchMapOverlay | null {
  const { nearestBoard } = useCapability('calls');
  const board = useDispatchBoardStore((state) => state.board);
  const boardKey = useDispatchBoardStore((state) => state.boardKey);
  const fetchNearestBoard = useDispatchBoardStore((state) => state.fetchNearestBoard);
  const latitude = location?.latitude ?? null;
  const longitude = location?.longitude ?? null;
  const active = nearestBoard && enabled && latitude !== null && longitude !== null;

  useEffect(() => {
    if (active && latitude !== null && longitude !== null) void fetchNearestBoard(latitude, longitude);
  }, [active, latitude, longitude, fetchNearestBoard]);

  return useMemo(() => {
    if (!active || latitude === null || longitude === null || boardKey !== boardKeyFor(latitude, longitude)) return null;

    return buildDispatchMapOverlay(board, groups);
  }, [active, latitude, longitude, board, boardKey, groups]);
}
