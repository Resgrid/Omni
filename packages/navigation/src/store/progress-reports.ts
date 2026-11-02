import { isApiError, reportNavigationProgress } from '@resgrid/api';
import { dataNow, defineDataHandler, getDataApiContext, submitWrite } from '@resgrid/data';
import { UnitNavigationState } from '@resgrid/models';
import type { OutboxHandler } from '@resgrid/offline';

import type { NavigationProgressReport } from './services';

/**
 * Live ETA reports (MapLibre plan §9.4) go through the outbox so a report made in a dead zone still goes out when the
 * signal returns — but only while it is current: a queued report older than its useful life is dropped, never replayed
 * (the server forgets a navigation two minutes after its last report anyway). Newest wins per unit.
 *
 * No `EtaUtc` is sent: Core trusts one that looks plausible, so a Unit whose clock is a few minutes off would move the
 * ETA Dispatch and Big Board show. Core sets it from `RemainingSeconds` on its own clock instead, less the time the
 * report waited in the queue (a difference of device times, which clock skew does not change).
 */
export const NAVIGATION_PROGRESS_EVENT = 'navigation.progress';

/** Started / Progress / Rerouted reports older than this are dropped. */
export const PROGRESS_REPORT_TTL_MS = 60_000;
/** Arrived / Ended reports live a little longer (they clear the ETA on the dispatcher's screen). */
export const FINAL_REPORT_TTL_MS = 120_000;

export const navigationProgressCoalesceKey = (unitId: number): string => `navigation-progress:${unitId}`;

const isFinal = (state: number): boolean => state === UnitNavigationState.Arrived || state === UnitNavigationState.Ended;

export const isReportStale = (report: NavigationProgressReport, now: number): boolean => now - report.at > (isFinal(report.state) ? FINAL_REPORT_TTL_MS : PROGRESS_REPORT_TTL_MS);

export const navigationProgressHandler: OutboxHandler<NavigationProgressReport, unknown> = defineDataHandler<NavigationProgressReport>({
  type: NAVIGATION_PROGRESS_EVENT,
  maxAttempts: 3,
  send: async (event) => {
    const report = event.payload;
    const now = dataNow();
    if (isReportStale(report, now)) return null;
    const waitedSeconds = Math.max(0, (now - report.at) / 1000);
    try {
      return await reportNavigationProgress(getDataApiContext(), {
        UnitId: report.unitId,
        CallId: report.callId,
        RouteInstanceId: report.routeInstanceId,
        RouteInstanceStopId: report.routeInstanceStopId,
        State: report.state,
        RemainingSeconds: Math.max(0, Math.round(report.remainingSeconds - waitedSeconds)),
        RemainingMeters: report.remainingMeters,
        IsTrafficAware: report.isTrafficAware,
        Provider: report.provider,
      });
    } catch (error) {
      // A refused report (the call closed, the unit changed) is not worth a Pending sync entry: drop it.
      if (isApiError(error) && error.kind === 'http' && (error.status ?? 0) >= 400 && (error.status ?? 0) < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429) return null;
      throw error;
    }
  },
});

/** Queues a report and tries to send it now. */
export const submitNavigationProgress = async (report: NavigationProgressReport): Promise<void> => {
  await submitWrite<NavigationProgressReport>({ type: NAVIGATION_PROGRESS_EVENT, payload: report, coalesceKey: navigationProgressCoalesceKey(report.unitId), coalesceAt: report.at });
};
