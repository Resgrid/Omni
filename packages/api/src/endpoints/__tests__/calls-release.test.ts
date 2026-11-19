import { createTestContext, httpError, lastRequest, ok } from '../../__tests__/helpers';
import * as api from '../../index';

const body = (config: { data?: unknown }) => JSON.parse(String(config.data));

describe('releasing a resource from an open call', () => {
  it('posts a unit to Calls/ReleaseUnit and a person to Calls/ReleasePersonnel, with the notify choice', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, { Status: 'updated', Data: { CallId: '123', UnitId: '45', ReleasedOn: '2026-11-16T10:32:00Z', StatusApplied: false } }));

    const unit = await api.releaseFromCallWith(ctx, { kind: 'unit', callId: '123', resourceId: '45', notify: true });

    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/Calls/ReleaseUnit' });
    expect(body(lastRequest(adapter))).toEqual({ CallId: '123', UnitId: '45', Notify: true });
    expect(unit.Data?.StatusApplied).toBe(false);

    await api.releaseFromCallWith(ctx, { kind: 'personnel', callId: '123', resourceId: 'f1e2d3c4-0000-4000-8000-000000000001', notify: false });

    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/Calls/ReleasePersonnel' });
    expect(body(lastRequest(adapter))).toEqual({ CallId: '123', UserId: 'f1e2d3c4-0000-4000-8000-000000000001', Notify: false });
  });

  it("surfaces Core's plain-text refusal on the error", async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => {
      throw httpError(config, 400, 'That unit was already released from this call.');
    });

    await expect(api.releaseUnit(ctx, { CallId: '123', UnitId: '45', Notify: true })).rejects.toMatchObject({ kind: 'http', status: 400, data: 'That unit was already released from this call.' });
  });
});
