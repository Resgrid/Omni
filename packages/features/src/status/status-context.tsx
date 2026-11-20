import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import { announceActiveCallChange } from './lib/active-call-events';

/**
 * Session facts the status sheets need that no lower layer owns yet: the department's "Hold to set status" setting
 * (config `StatusHoldToConfirm`), its transport destination checks (config `TransportDestinationChecks`), the crew's active
 * call and how to change it (Unit: a call picked as a destination becomes the active call), and the active unit (Unit).
 * The app shell provides them once; every value has a safe default.
 */
export interface StatusContextValue {
  holdToConfirm: boolean;
  /** Department "Transport destination checks": a transport status to a destination other than its call's assigned one needs a reason (the note). */
  transportDestinationChecks: boolean;
  activeCallId: string | null;
  /** Sets the crew's active call; a different call is also announced (`onActiveCallChanged`) to the modules that act on it. */
  onActiveCallChange?: (callId: string) => void;
  /** Unit: the unit this device is (status console, chat as the unit). */
  activeUnitId: string | null;
}

const DEFAULT_VALUE: StatusContextValue = { holdToConfirm: false, transportDestinationChecks: false, activeCallId: null, activeUnitId: null };

const StatusContext = createContext<StatusContextValue>(DEFAULT_VALUE);

export interface StatusProviderProps extends Partial<StatusContextValue> {
  children?: React.ReactNode;
}

export function StatusProvider({ children, holdToConfirm = false, transportDestinationChecks = false, activeCallId = null, onActiveCallChange, activeUnitId = null }: StatusProviderProps) {
  // Every path that sets the active call (picker, status sheet, call detail, map) comes through here: a different call is
  // announced once, after the shell has it. The ref follows the shell's value and each change made here at once, so two
  // quick picks of the same call announce it once.
  const activeCallRef = useRef(activeCallId);

  useEffect(() => {
    activeCallRef.current = activeCallId;
  }, [activeCallId]);

  const changeActiveCall = useCallback(
    (callId: string) => {
      if (!onActiveCallChange) return;
      const changed = callId !== activeCallRef.current;
      onActiveCallChange(callId);
      activeCallRef.current = callId;

      if (changed) announceActiveCallChange(callId);
    },
    [onActiveCallChange]
  );

  const value = useMemo<StatusContextValue>(() => {
    const base: StatusContextValue = { holdToConfirm, transportDestinationChecks, activeCallId, activeUnitId };

    return onActiveCallChange ? { ...base, onActiveCallChange: changeActiveCall } : base;
  }, [activeCallId, activeUnitId, changeActiveCall, holdToConfirm, onActiveCallChange, transportDestinationChecks]);

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export const useStatusContext = (): StatusContextValue => useContext(StatusContext);
