import type { AwaitingResourcesCallData, DispatchResponseCodeData } from '@resgrid/models';

/** The call number when it has one, else its id, as dispatchers refer to it. */
export const awaitingCallLabel = (call: Pick<AwaitingResourcesCallData, 'CallId' | 'CallNumber'>): string => call.CallNumber?.trim() || String(call.CallId);

/**
 * The catalog entry for a requirement's response code: by id on newer servers, else by the code text older servers send.
 * Undefined when the requirement asks for no code or the department no longer has it.
 */
export const findResponseCode = (catalog: readonly DispatchResponseCodeData[], code: string | null | undefined, codeId?: number | null): DispatchResponseCodeData | undefined => {
  if (!code) return undefined;
  return (codeId != null ? catalog.find((entry) => entry.Id === codeId) : undefined) ?? catalog.find((entry) => entry.Code === code);
};

/** A unit as dispatchers read it: "M-1 (MUG)". */
export const unitLabel = (name: string | null | undefined, typeName: string | null | undefined): string => (typeName ? `${name ?? ''} (${typeName})` : (name ?? ''));
