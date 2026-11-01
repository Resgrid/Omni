import type { VariantId, VariantManifest } from '@resgrid/config';

/**
 * Per-variant offline scope (omni-plan §8.5). The base lists mirror the plan table; capability and
 * module gates then drop what a variant cannot do (e.g. `calls.create: none`, no `unit-routes`).
 */
export type DataHydrationStepId =
  | 'data.calls'
  | 'data.call-queues'
  | 'data.units'
  | 'data.unit-roles'
  | 'data.personnel'
  | 'data.own-status'
  | 'data.contacts'
  | 'data.pois'
  | 'data.protocols'
  | 'data.notes'
  | 'data.weather-alerts'
  | 'data.shifts'
  | 'data.calendar'
  | 'data.messages'
  | 'data.routes'
  | 'data.inventory'
  | 'data.incident-command'
  | 'data.custom-maps';

export type DataOutboxType =
  | 'calls.create'
  | 'calls.note.add'
  | 'calls.file.upload'
  | 'checkIn.perform'
  | 'units.status.set'
  | 'personnel.status.set'
  | 'personnel.staffing.set'
  | 'chat.message.send'
  | 'messages.send'
  | 'routes.stop'
  | 'inventory.count.save'
  | 'operations.timeEntries.save'
  | 'operations.expense.save'
  | 'records.draft.save'
  | 'records.command'
  | 'workOrders.report'
  | 'ic';

interface ScopeDefinition {
  hydration: DataHydrationStepId[];
  /** Steps that must be current for "field ready". */
  required: DataHydrationStepId[];
  handlers: DataOutboxType[];
}

const SCOPES: Record<VariantId, ScopeDefinition> = {
  responder: {
    hydration: ['data.calls', 'data.units', 'data.personnel', 'data.own-status', 'data.contacts', 'data.protocols', 'data.notes', 'data.weather-alerts', 'data.pois', 'data.shifts', 'data.calendar', 'data.messages'],
    required: ['data.calls', 'data.own-status', 'data.personnel'],
    handlers: [
      'calls.create',
      'calls.note.add',
      'calls.file.upload',
      'checkIn.perform',
      'personnel.status.set',
      'personnel.staffing.set',
      'chat.message.send',
      'messages.send',
      'records.draft.save',
      'records.command',
      'workOrders.report',
    ],
  },
  unit: {
    hydration: ['data.calls', 'data.units', 'data.unit-roles', 'data.personnel', 'data.contacts', 'data.pois', 'data.routes', 'data.protocols', 'data.weather-alerts', 'data.inventory'],
    required: ['data.calls', 'data.units', 'data.personnel'],
    handlers: [
      'calls.create',
      'calls.note.add',
      'calls.file.upload',
      'checkIn.perform',
      'units.status.set',
      'chat.message.send',
      'routes.stop',
      'inventory.count.save',
      'operations.timeEntries.save',
      'operations.expense.save',
      'records.draft.save',
      'records.command',
    ],
  },
  ic: {
    hydration: ['data.calls', 'data.units', 'data.personnel', 'data.incident-command', 'data.pois', 'data.protocols', 'data.custom-maps'],
    required: ['data.calls', 'data.units', 'data.personnel', 'data.incident-command'],
    handlers: ['calls.create', 'checkIn.perform', 'personnel.status.set', 'chat.message.send', 'records.draft.save', 'records.command', 'ic'],
  },
  dispatch: {
    hydration: ['data.calls', 'data.call-queues', 'data.units', 'data.personnel', 'data.pois', 'data.contacts', 'data.protocols', 'data.weather-alerts'],
    required: ['data.calls', 'data.units', 'data.personnel'],
    handlers: ['calls.create', 'calls.note.add', 'checkIn.perform', 'units.status.set', 'personnel.status.set', 'chat.message.send', 'records.draft.save', 'records.command'],
  },
  bigboard: {
    // Read-only durable dashboard; widget acknowledgements belong to the dashboard module.
    hydration: ['data.calls', 'data.units', 'data.personnel', 'data.weather-alerts'],
    required: ['data.calls', 'data.units', 'data.personnel'],
    handlers: [],
  },
};

const stepAllowed = (manifest: VariantManifest, step: DataHydrationStepId): boolean => {
  const { capabilities: caps, modules } = manifest;
  switch (step) {
    case 'data.call-queues':
      return caps.calls.queues;
    case 'data.own-status':
      return caps.status.subject === 'personnel' && caps.status.staffing;
    case 'data.unit-roles':
      return caps.status.subject === 'unit';
    case 'data.shifts':
      return modules.includes('shifts');
    case 'data.calendar':
      return modules.includes('calendar');
    case 'data.messages':
      return modules.includes('messages');
    case 'data.routes':
      return modules.includes('unit-routes');
    case 'data.inventory':
      return modules.includes('inventory');
    case 'data.incident-command':
      return caps.incidentCommand === 'command';
    case 'data.custom-maps':
      return caps.maps.customIndoor;
    default:
      return true;
  }
};

const handlerAllowed = (manifest: VariantManifest, type: DataOutboxType): boolean => {
  const { capabilities: caps, modules } = manifest;
  switch (type) {
    case 'calls.create':
      return caps.calls.create !== 'none';
    case 'checkIn.perform':
      return caps.checkIn.self || caps.checkIn.others;
    case 'units.status.set':
      return caps.status.subject === 'unit' || caps.status.onBehalf;
    case 'personnel.status.set':
      return caps.status.subject === 'personnel' || caps.status.onBehalf;
    case 'personnel.staffing.set':
      return caps.status.staffing;
    case 'chat.message.send':
      return caps.realtime.chatHub;
    case 'messages.send':
      return modules.includes('messages');
    case 'routes.stop':
      return modules.includes('unit-routes');
    case 'inventory.count.save':
      return modules.includes('inventory');
    case 'workOrders.report':
      return modules.includes('work-orders');
    case 'ic':
      return caps.incidentCommand === 'command';
    default:
      return true;
  }
};

export interface DataOfflineScope {
  variant: VariantId;
  hydration: DataHydrationStepId[];
  required: DataHydrationStepId[];
  handlers: DataOutboxType[];
}

/** The data layer's offline scope for a variant manifest. */
export function resolveDataOfflineScope(manifest: VariantManifest): DataOfflineScope {
  const definition = SCOPES[manifest.id];
  const hydration = definition.hydration.filter((step) => stepAllowed(manifest, step));
  return {
    variant: manifest.id,
    hydration,
    required: definition.required.filter((step) => hydration.includes(step)),
    handlers: definition.handlers.filter((type) => handlerAllowed(manifest, type)),
  };
}
