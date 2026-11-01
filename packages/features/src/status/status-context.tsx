import React, { createContext, useContext, useMemo } from 'react';

/**
 * Session facts the status sheets need that no lower layer owns yet: the department's "Hold to set status" setting
 * (config `StatusHoldToConfirm`), the crew's active call and how to change it (Unit: a call picked as a destination
 * becomes the active call), and the active unit (Unit). The app shell provides them once; every value has a safe default.
 */
export interface StatusContextValue {
  holdToConfirm: boolean;
  activeCallId: string | null;
  onActiveCallChange?: (callId: string) => void;
  /** Unit: the unit this device is (status console, chat as the unit). */
  activeUnitId: string | null;
}

const DEFAULT_VALUE: StatusContextValue = { holdToConfirm: false, activeCallId: null, activeUnitId: null };

const StatusContext = createContext<StatusContextValue>(DEFAULT_VALUE);

export interface StatusProviderProps extends Partial<StatusContextValue> {
  children?: React.ReactNode;
}

export function StatusProvider({ children, holdToConfirm = false, activeCallId = null, onActiveCallChange, activeUnitId = null }: StatusProviderProps) {
  const value = useMemo<StatusContextValue>(() => ({ holdToConfirm, activeCallId, activeUnitId, ...(onActiveCallChange ? { onActiveCallChange } : {}) }), [activeCallId, activeUnitId, holdToConfirm, onActiveCallChange]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export const useStatusContext = (): StatusContextValue => useContext(StatusContext);
