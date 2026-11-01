import { personnelFullName, usePersonnelStore } from '@resgrid/data';
import { useLiveKitStore } from '@resgrid/voice';
import { useEffect, useRef } from 'react';

import { useConsoleStore } from './use-console-store';

/**
 * Feeds the console's radio log from the PTT channel (Dispatch baseline LiveKit transmissions): a participant becoming an
 * active speaker starts a transmission, dropping out of the active speakers ends it (with its duration). Names come from
 * the personnel roster (LiveKit identities are user ids), falling back to the identity.
 */
export function useRadioLog(enabled = true): void {
  const speakers = useLiveKitStore((state) => state.activeSpeakerIdentities);
  const previous = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const current = new Set(speakers);
    const store = useConsoleStore.getState();
    const roster = usePersonnelStore.getState().personnel;
    for (const identity of current) {
      if (!previous.current.has(identity)) {
        const person = roster.find((row) => row.UserId === identity);
        store.startRadioTransmission(identity, (person ? personnelFullName(person) : '') || identity);
      }
    }
    for (const identity of previous.current) if (!current.has(identity)) store.endRadioTransmission(identity);
    previous.current = current;
  }, [enabled, speakers]);
}
