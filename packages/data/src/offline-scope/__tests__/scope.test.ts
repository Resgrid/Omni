import { getActiveCalls, getAllCallPriorities, getAllCallTypes, getCallExtraData } from '@resgrid/api';
import type { HydrationStep } from '@resgrid/offline';
import { createOutboxHandlerRegistry } from '@resgrid/offline/testing';

import { createDataTestRuntime, manifest, ok } from '../../__tests__/helpers';
import { ALL_DATA_OUTBOX_HANDLERS, HYDRATION_MAX_AGE_MS, registerDataHydrationSteps, registerDataOutboxHandlers } from '../register';
import { resolveDataOfflineScope } from '../scope';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveCalls: jest.fn(),
  getAllCallPriorities: jest.fn(),
  getAllCallTypes: jest.fn(),
  getCallExtraData: jest.fn(),
}));

describe('per-variant offline scope (plan §8.5)', () => {
  it('Responder: own status/staffing, shifts, calendar, messages; writes status, staffing, notes, images, messages, work orders', () => {
    const scope = resolveDataOfflineScope(manifest('responder'));
    expect(scope.hydration).toEqual(
      expect.arrayContaining(['data.calls', 'data.own-status', 'data.shifts', 'data.calendar', 'data.messages', 'data.contacts', 'data.protocols', 'data.notes', 'data.pois', 'data.weather-alerts'])
    );
    expect(scope.hydration).not.toContain('data.routes');
    expect(scope.handlers).toEqual(
      expect.arrayContaining(['calls.create', 'personnel.status.set', 'personnel.staffing.set', 'calls.note.add', 'calls.file.upload', 'messages.send', 'workOrders.report', 'checkIn.perform', 'records.draft.save'])
    );
    expect(scope.handlers).not.toContain('units.status.set');
  });

  it('Unit: units, roles, routes, inventory; writes unit status, route stops, inventory counts, time reports', () => {
    const scope = resolveDataOfflineScope(manifest('unit'));
    expect(scope.hydration).toEqual(expect.arrayContaining(['data.units', 'data.unit-roles', 'data.routes', 'data.inventory', 'data.personnel']));
    expect(scope.handlers).toEqual(expect.arrayContaining(['units.status.set', 'routes.stop', 'inventory.count.save', 'operations.timeEntries.save', 'operations.expense.save', 'calls.create']));
    expect(scope.handlers).not.toContain('personnel.staffing.set');
  });

  it('IC: the command board is required for field ready; the IC event handlers are registered', () => {
    const scope = resolveDataOfflineScope(manifest('ic'));
    expect(scope.required).toContain('data.incident-command');
    expect(scope.hydration).toContain('data.custom-maps');
    expect(scope.handlers).toContain('ic');
  });

  it('Dispatch: call queues, on-behalf statuses and queued new calls', () => {
    const scope = resolveDataOfflineScope(manifest('dispatch'));
    expect(scope.hydration).toContain('data.call-queues');
    expect(scope.handlers).toEqual(expect.arrayContaining(['calls.create', 'calls.note.add', 'units.status.set', 'personnel.status.set', 'checkIn.perform']));
  });

  it('Dispatch: the assist tier queues command board writes; checklist runs stay with Responder and Unit', () => {
    expect(resolveDataOfflineScope(manifest('dispatch')).handlers).toContain('ic');
    expect(resolveDataOfflineScope(manifest('dispatch')).handlers).not.toContain('checklists.run.save');
    expect(resolveDataOfflineScope(manifest('responder')).handlers).toContain('checklists.run.save');
    expect(resolveDataOfflineScope(manifest('unit')).handlers).toContain('checklists.run.save');
    expect(resolveDataOfflineScope(manifest('bigboard')).handlers).not.toContain('ic');
  });

  it('BigBoard: read-only working set, no write handlers', () => {
    const scope = resolveDataOfflineScope(manifest('bigboard'));
    expect(scope.handlers).toEqual([]);
    expect(scope.hydration).toEqual(['data.calls', 'data.units', 'data.personnel', 'data.weather-alerts']);
  });

  it('registers only the handlers in scope', () => {
    const registry = createOutboxHandlerRegistry();
    registerDataOutboxHandlers(manifest('unit'), registry);
    expect(registry.has('units.status.set')).toBe(true);
    expect(registry.has('routes.stop.checkIn')).toBe(true);
    expect(registry.has('personnel.staffing.set')).toBe(false);
    expect(registry.has('ic.command.establish')).toBe(false);
    const ic = createOutboxHandlerRegistry();
    registerDataOutboxHandlers(manifest('ic'), ic);
    expect(ic.types().filter((type) => type.startsWith('ic.'))).toHaveLength(26);
  });

  it('defines a unique type for every handler', () => {
    const types = ALL_DATA_OUTBOX_HANDLERS.map((handler) => handler.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('hydration steps', () => {
  it('registers one step per scoped store; runs it and reports field ready by freshness', async () => {
    const runtime = await createDataTestRuntime({ variant: 'bigboard' });
    jest.mocked(getActiveCalls).mockResolvedValue(ok([]) as never);
    jest.mocked(getAllCallPriorities).mockResolvedValue(ok([]) as never);
    jest.mocked(getAllCallTypes).mockResolvedValue(ok([]) as never);
    jest.mocked(getCallExtraData).mockResolvedValue(ok({ Dispatches: [] }) as never);
    const steps: HydrationStep[] = [];
    registerDataHydrationSteps({ registerHydrationStep: (step) => (steps.push(step), () => undefined) }, manifest('bigboard'));
    expect(steps.map((step) => step.id)).toEqual(['data.calls', 'data.units', 'data.personnel', 'data.weather-alerts']);
    expect(steps.every((step) => step.id === 'data.weather-alerts' || step.required)).toBe(true);

    const calls = steps[0];
    expect(await calls.isCurrent()).toBe(false);
    await calls.run({ reportProgress: () => undefined, isCancelled: () => false });
    expect(getActiveCalls).toHaveBeenCalledWith(expect.anything(), { forceRefresh: true });
    expect(await calls.isCurrent()).toBe(true);
    runtime.clock.advance(HYDRATION_MAX_AGE_MS + 1);
    expect(await calls.isCurrent()).toBe(false);
  });
});
