import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'muted';

export interface ToastOptions {
  /** Milliseconds before auto-dismiss (default 3000). 0 or less keeps the toast until dismissed. */
  duration?: number;
  /** Makes the toast pressable: runs this and dismisses it. */
  onPress?: () => void;
  /**
   * An unsolicited alert (a push or realtime cue: a new alert, an offer, a message), not feedback on something the member
   * did. Alert toasts are dropped while the alert gate says so (a dispatcher on break, `setToastAlertGate`).
   */
  alert?: boolean;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  /** Already-translated text: the toast renders it verbatim (see ToastMessage). */
  message: string;
  onPress?: () => void;
}

export const DEFAULT_TOAST_DURATION_MS = 3000;

interface ToastStore {
  toasts: ToastItem[];
  /**
   * Toast hosts mounted inside native Modal windows, in the order they opened. A native Modal is its
   * own window, so toasts drawn in the app window sit underneath it; while any of these exist the
   * toasts render in the most recently opened one instead of the app window.
   */
  modalHosts: string[];
  showToast: (type: ToastType, message: string, title?: string, options?: ToastOptions) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  registerModalHost: (hostId: string) => void;
  unregisterModalHost: (hostId: string) => void;
}

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Returns true while alert toasts are held back. Set once by the app shell; null shows every toast. */
let alertGate: (() => boolean) | null = null;

/** Installs (or with null removes) the check alert toasts pass before they show. A gate that throws holds nothing back. */
export const setToastAlertGate = (gate: (() => boolean) | null): void => {
  alertGate = gate;
};

const isAlertHeldBack = (): boolean => {
  try {
    return alertGate?.() === true;
  } catch {
    return false;
  }
};

let toastSequence = 0;

const nextToastId = (): string => {
  toastSequence += 1;
  return `${toastSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const clearTimer = (id: string): void => {
  const timerId = toastTimers.get(id);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    toastTimers.delete(id);
  }
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  modalHosts: [],
  showToast: (type, message, title, options) => {
    const id = nextToastId();

    // Held back: nothing shows, and the id refers to no toast (removing it is a no-op).
    if (options?.alert && isAlertHeldBack()) return id;
    const toast: ToastItem = { id, type, message };
    if (title !== undefined) {
      toast.title = title;
    }
    if (options?.onPress) {
      toast.onPress = options.onPress;
    }
    set((state) => ({ toasts: [...state.toasts, toast] }));

    const duration = options?.duration ?? DEFAULT_TOAST_DURATION_MS;
    if (duration > 0) {
      const timerId = setTimeout(() => {
        toastTimers.delete(id);
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
      }, duration);
      toastTimers.set(id, timerId);
    }

    return id;
  },
  removeToast: (id) => {
    clearTimer(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  clearToasts: () => {
    toastTimers.forEach((timerId) => clearTimeout(timerId));
    toastTimers.clear();
    set({ toasts: [] });
  },
  registerModalHost: (hostId) => {
    set((state) => (state.modalHosts.includes(hostId) ? state : { modalHosts: [...state.modalHosts, hostId] }));
  },
  unregisterModalHost: (hostId) => {
    set((state) => ({ modalHosts: state.modalHosts.filter((id) => id !== hostId) }));
  },
}));

/** Shows a toast from anywhere (services, stores' callers, error handlers). Returns its id. */
export const showToast = (type: ToastType, message: string, title?: string, options?: ToastOptions): string => useToastStore.getState().showToast(type, message, title, options);

/** Dismisses a toast early (also cancels its timer). */
export const removeToast = (id: string): void => useToastStore.getState().removeToast(id);
