import { parseUtcMs } from '@resgrid/core/utils/dates';
import { breakDueBackMs, plannedBreakEndMs } from '@resgrid/data';
import { type DispatcherBreakData, DispatcherBreakState, type DispatcherCoverageResultData, type DispatcherCoverageSlotData } from '@resgrid/models';

/**
 * The team timeline (plan D11): one row per dispatcher with their duty window and their breaks (planned ones as an
 * outline, taken ones solid, an overdue one red), under a coverage lane that is red where fewer dispatchers than the
 * minimum are available and hatched where breaks overlap. Pure layout maths; the component draws it.
 */

export interface TimelineSegment {
  startMs: number;
  endMs: number;
}

export interface TimelineDuty extends TimelineSegment {
  shiftName: string | null;
  isSupervisor: boolean;
}

export interface TimelineBreak extends TimelineSegment {
  breakEntry: DispatcherBreakData;
  /** Taken (running or finished): drawn solid; otherwise planned, drawn as an outline. */
  taken: boolean;
  /** Running past its length. */
  overdue: boolean;
}

export interface TimelineRow {
  userId: string;
  name: string;
  duty: TimelineDuty[];
  breaks: TimelineBreak[];
}

export interface CoverageTimeline {
  startMs: number;
  endMs: number;
  rows: TimelineRow[];
  /** Spans where fewer than the minimum are available. */
  belowMinimum: TimelineSegment[];
  /** Spans where breaks overlap. */
  overlaps: TimelineSegment[];
  /** Whole hours inside the window, for the scale. */
  hourTicks: number[];
}

const HOUR = 3600000;

const clip = (segment: TimelineSegment, startMs: number, endMs: number): TimelineSegment | null => {
  const start = Math.max(segment.startMs, startMs);
  const end = Math.min(segment.endMs, endMs);

  return end > start ? { startMs: start, endMs: end } : null;
};

/** Consecutive slots that match, merged into spans. */
export const mergeSlots = (slots: readonly DispatcherCoverageSlotData[], matches: (slot: DispatcherCoverageSlotData) => boolean): TimelineSegment[] => {
  const spans: TimelineSegment[] = [];

  for (const slot of slots) {
    const start = parseUtcMs(slot.StartUtc);
    const end = parseUtcMs(slot.EndUtc);

    if (start === null || end === null || !matches(slot)) continue;
    const last = spans[spans.length - 1];

    if (last && last.endMs >= start) last.endMs = Math.max(last.endMs, end);
    else spans.push({ startMs: start, endMs: end });
  }

  return spans;
};

const breakSegment = (entry: DispatcherBreakData, now: number): TimelineBreak | null => {
  if (entry.State === DispatcherBreakState.Cancelled) return null;
  const started = parseUtcMs(entry.StartedOn);

  if (started !== null) {
    const dueBack = breakDueBackMs(entry);
    const active = entry.State === DispatcherBreakState.Active;
    const end = parseUtcMs(entry.EndedOn) ?? (active ? Math.max(now, dueBack ?? now) : (dueBack ?? started));

    return { startMs: started, endMs: Math.max(end, started + 60000), breakEntry: entry, taken: true, overdue: active && dueBack !== null && now > dueBack };
  }

  const start = parseUtcMs(entry.ScheduledStartOn);
  const end = plannedBreakEndMs(entry);

  return start === null || end === null ? null : { startMs: start, endMs: Math.max(end, start + 60000), breakEntry: entry, taken: false, overdue: false };
};

/** Lays the coverage answer out on one time axis (the asked window, else the span of the duty and breaks it holds). */
export const buildCoverageTimeline = (coverage: DispatcherCoverageResultData, now: number): CoverageTimeline => {
  const breaks = (coverage.Breaks ?? []).map((entry) => breakSegment(entry, now)).filter((entry): entry is TimelineBreak => entry !== null);

  const duty = (coverage.Duty ?? []).flatMap((entry) => {
    const start = parseUtcMs(entry.StartUtc);
    const end = parseUtcMs(entry.EndUtc);

    return start !== null && end !== null && end > start ? [{ entry, startMs: start, endMs: end }] : [];
  });

  const edges = [...duty.flatMap((entry) => [entry.startMs, entry.endMs]), ...breaks.flatMap((entry) => [entry.startMs, entry.endMs])];
  const startMs = parseUtcMs(coverage.FromUtc) ?? (edges.length > 0 ? Math.min(...edges) : now - 4 * HOUR);
  const endMs = Math.max(parseUtcMs(coverage.ToUtc) ?? (edges.length > 0 ? Math.max(...edges) : now + 8 * HOUR), startMs + HOUR);
  const names = coverage.Names ?? {};
  const rows = new Map<string, TimelineRow>();

  const rowFor = (userId: string, fallbackName: string | null): TimelineRow => {
    const existing = rows.get(userId);

    if (existing) return existing;
    const row: TimelineRow = { userId, name: names[userId] || fallbackName || userId, duty: [], breaks: [] };
    rows.set(userId, row);

    return row;
  };

  for (const entry of duty) {
    const clipped = clip(entry, startMs, endMs);

    if (clipped) rowFor(entry.entry.UserId, null).duty.push({ ...clipped, shiftName: entry.entry.ShiftName, isSupervisor: entry.entry.IsSupervisor });
  }

  for (const entry of breaks) {
    const clipped = clip(entry, startMs, endMs);

    if (clipped) rowFor(entry.breakEntry.UserId, entry.breakEntry.UserName).breaks.push({ ...entry, ...clipped });
  }

  const hourTicks: number[] = [];

  for (let tick = Math.ceil(startMs / HOUR) * HOUR; tick <= endMs; tick += HOUR) hourTicks.push(tick);

  return {
    startMs,
    endMs,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    belowMinimum: mergeSlots(coverage.Slots ?? [], (slot) => slot.BelowMinimum),
    overlaps: mergeSlots(coverage.Slots ?? [], (slot) => slot.BreaksOverlap),
    hourTicks,
  };
};

/** Where a span sits on the drawn timeline (px). */
export interface SegmentBox {
  left: number;
  width: number;
}

/** Left edge and width (px) of a span on a timeline `width` px wide. */
export const segmentBox = (segment: TimelineSegment, timeline: Pick<CoverageTimeline, 'startMs' | 'endMs'>, width: number): SegmentBox => {
  const span = Math.max(1, timeline.endMs - timeline.startMs);
  const left = ((segment.startMs - timeline.startMs) / span) * width;

  return { left, width: Math.max(2, ((segment.endMs - segment.startMs) / span) * width) };
};

/** The px position of an instant on the timeline. */
export const instantOffset = (ms: number, timeline: Pick<CoverageTimeline, 'startMs' | 'endMs'>, width: number): number => ((ms - timeline.startMs) / Math.max(1, timeline.endMs - timeline.startMs)) * width;
