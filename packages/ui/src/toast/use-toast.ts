import React from 'react';

import { type ToastOptions, type ToastType, useToastStore } from './store';

export interface UseToastResult {
  show: (type: ToastType, message: string, title?: string, options?: ToastOptions) => string;
  success: (message: string, title?: string, options?: ToastOptions) => string;
  error: (message: string, title?: string, options?: ToastOptions) => string;
  warning: (message: string, title?: string, options?: ToastOptions) => string;
  info: (message: string, title?: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

/** Toast helpers for components. Messages must already be translated (`t('…')`). */
export const useToast = (): UseToastResult => {
  const showToast = useToastStore((state) => state.showToast);
  const removeToast = useToastStore((state) => state.removeToast);

  return React.useMemo(
    () => ({
      show: (type, message, title, options) => showToast(type, message, title, options),
      success: (message, title, options) => showToast('success', message, title, options),
      error: (message, title, options) => showToast('error', message, title, options),
      warning: (message, title, options) => showToast('warning', message, title, options),
      info: (message, title, options) => showToast('info', message, title, options),
      dismiss: (id) => removeToast(id),
    }),
    [showToast, removeToast]
  );
};
