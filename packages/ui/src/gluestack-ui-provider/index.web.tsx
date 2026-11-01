'use client';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';
import React, { useEffect, useLayoutEffect } from 'react';

import { ColorSchemeProvider, type ModeType } from '../theme/color-scheme';
import { script } from './script';

export type { ModeType };

export const useSafeLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function GluestackUIProvider({ mode = 'light', ...props }: { mode?: ModeType; children?: React.ReactNode }) {
  const handleMediaQuery = React.useCallback((e: MediaQueryListEvent) => {
    script(e.matches ? 'dark' : 'light');
  }, []);

  useSafeLayoutEffect(() => {
    if (mode !== 'system') {
      const documentElement = document.documentElement;
      if (documentElement) {
        documentElement.classList.add(mode);
        documentElement.classList.remove(mode === 'light' ? 'dark' : 'light');
        documentElement.style.colorScheme = mode;
      }
    } else {
      script('system');
    }
  }, [mode]);

  useSafeLayoutEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    media.addEventListener('change', handleMediaQuery);

    return () => media.removeEventListener('change', handleMediaQuery);
  }, [handleMediaQuery, mode]);

  return (
    <>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(${script.toString()})('${mode}')`,
        }}
      />
      <OverlayProvider>
        <ToastProvider>
          <ColorSchemeProvider mode={mode}>{props.children}</ColorSchemeProvider>
        </ToastProvider>
      </OverlayProvider>
    </>
  );
}
