import { reportNavigationProgress } from '@resgrid/api';
import { dataNow } from '@resgrid/data';
import { UnitNavigationState } from '@resgrid/models';

import { navigationProgressHandler } from '../store/progress-reports';
import type { NavigationProgressReport } from '../store/services';

jest.mock('@resgrid/api', () => ({ ...jest.requireActual('@resgrid/api'), reportNavigationProgress: jest.fn(async () => ({ Status: 'success' })) }));
jest.mock('@resgrid/data', () => ({ ...jest.requireActual('@resgrid/data'), dataNow: jest.fn(), getDataApiContext: jest.fn(() => ({})) }));

const report: NavigationProgressReport = {
  unitId: 7,
  callId: 12,
  routeInstanceId: null,
  routeInstanceStopId: null,
  state: UnitNavigationState.Progress,
  remainingSeconds: 300,
  remainingMeters: 4000,
  isTrafficAware: true,
  provider: 'valhalla',
  at: 1_000_000,
};

const send = (payload: NavigationProgressReport) => navigationProgressHandler.send({ payload } as never, {} as never);

describe('navigation progress reports', () => {
  it('sends no device-clock ETA: the time left, less the time the report waited in the queue', async () => {
    jest.mocked(dataNow).mockReturnValue(report.at + 20_000);
    await send(report);
    const body = jest.mocked(reportNavigationProgress).mock.calls[0][1];
    expect(body).not.toHaveProperty('EtaUtc');
    expect(body).toMatchObject({ UnitId: 7, CallId: 12, State: UnitNavigationState.Progress, RemainingSeconds: 280, RemainingMeters: 4000, IsTrafficAware: true, Provider: 'valhalla' });
  });

  it('never sends a negative time left, and drops a report past its useful life', async () => {
    jest.mocked(reportNavigationProgress).mockClear();
    jest.mocked(dataNow).mockReturnValue(report.at + 30_000);
    await send({ ...report, remainingSeconds: 10 });
    expect(jest.mocked(reportNavigationProgress).mock.calls[0][1]).toMatchObject({ RemainingSeconds: 0 });

    jest.mocked(reportNavigationProgress).mockClear();
    jest.mocked(dataNow).mockReturnValue(report.at + 61_000);
    await expect(send(report)).resolves.toBeNull();
    expect(reportNavigationProgress).not.toHaveBeenCalled();
  });
});
