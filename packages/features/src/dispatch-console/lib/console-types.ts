/** One line of the console's activity log (selections, actions, realtime updates). Kept in memory only. */
export interface ActivityLogEntry {
  id: string;
  /** Epoch ms. */
  timestamp: number;
  type: 'call' | 'unit' | 'personnel' | 'system';
  /** Already translated. */
  action: string;
  /** Already translated (or a call/unit/person name). */
  description: string;
  metadata?: { callId?: string; unitId?: string; personnelId?: string };
}

/** One radio transmission heard on the PTT channel (LiveKit active speaker), kept in memory only. */
export interface RadioLogEntry {
  id: string;
  participantId: string;
  participantName: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number | null;
  /** Seconds; null while transmitting. */
  duration: number | null;
  isActive: boolean;
}

export type ConsoleTab = 'activity' | 'radio' | 'actions' | 'checkins' | 'weather';

/** Collapsible console cards (persisted per device, legacy keys kept). */
export type DashboardCardKey = 'active-calls' | 'units' | 'personnel' | 'notes' | 'resources' | 'map' | 'activity-log' | 'ptt';
