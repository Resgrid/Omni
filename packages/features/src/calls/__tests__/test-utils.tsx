// Test helpers for the calls-cluster features (not a test file). Import after './test-setup'.
import { securityStore } from '@resgrid/auth';
import { type Capabilities, parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';
import type { CallResultData, DepartmentRightsResultData } from '@resgrid/models';

import bigboard from '../../../../../apps/omni/variants/bigboard/variant.json';
import dispatch from '../../../../../apps/omni/variants/dispatch/variant.json';
import ic from '../../../../../apps/omni/variants/ic/variant.json';
import responder from '../../../../../apps/omni/variants/responder/variant.json';
import unit from '../../../../../apps/omni/variants/unit/variant.json';

const MANIFESTS: Record<VariantId, unknown> = { responder, unit, ic, dispatch, bigboard };

type CapabilityOverrides = { [K in keyof Capabilities]?: Partial<Capabilities[K]> | Capabilities[K] };

/** Activates a real variant manifest, optionally overriding capabilities. */
export function activateVariant(id: VariantId, overrides: CapabilityOverrides = {}): VariantManifest {
  resetActiveVariantForTests();
  const base = parseVariantManifest(MANIFESTS[id]);
  const capabilities = { ...base.capabilities } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const current = capabilities[key];
    capabilities[key] = value && typeof value === 'object' && current && typeof current === 'object' ? { ...current, ...value } : value;
  }
  const manifest = { ...base, capabilities: capabilities as Capabilities };
  setActiveVariant(manifest);
  return manifest;
}

/** Sets the signed-in user's rights (rights DTO gating). */
export function setRights(rights: Partial<DepartmentRightsResultData>): void {
  securityStore.setState({ rights: { CanCreateCalls: true, CanAddNote: true, ...rights } as DepartmentRightsResultData, isLoaded: true });
}

export const makeCall = (CallId: string, overrides: Partial<CallResultData> = {}): CallResultData =>
  ({
    CallId,
    Priority: 1,
    Name: `Call ${CallId}`,
    Nature: '<p>Smoke showing</p>',
    Note: '',
    Address: `${CallId} Main St`,
    DestinationPoiId: null,
    DestinationName: '',
    DestinationAddress: '',
    DestinationTypeName: '',
    DestinationPoiTypeId: null,
    DestinationLatitude: null,
    DestinationLongitude: null,
    Geolocation: '',
    LoggedOn: '',
    State: 0,
    Number: `C-${CallId}`,
    NotesCount: 0,
    AudioCount: 0,
    ImgagesCount: 0,
    FileCount: 0,
    What3Words: '',
    ContactName: '',
    ContactInfo: '',
    ReferenceId: '',
    ExternalId: '',
    IncidentId: '',
    AudioFileId: '',
    Type: 'Fire',
    AlarmLevel: 1,
    ActiveRunCardId: null,
    LoggedOnUtc: '2026-10-31T11:00:00Z',
    DispatchedOn: '',
    DispatchedOnUtc: '',
    ScheduledOn: '',
    ScheduledOnUtc: '',
    Latitude: '',
    Longitude: '',
    Protocols: [],
    UdfValues: [],
    CheckInTimersEnabled: false,
    ...overrides,
  }) as CallResultData;

/** Modal and sheet subtrees are reachable only with hidden elements included (the host Modal is not "visible"). */
export const hidden = { includeHiddenElements: true } as const;
