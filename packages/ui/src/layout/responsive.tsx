import React from 'react';

import { type FormFactor, type FormFactorOptions, useFormFactor } from './use-form-factor';

export type ResponsiveValues<T> = { phone: T } & Partial<Record<Exclude<FormFactor, 'phone'>, T>>;

const FALLBACK_ORDER: Record<FormFactor, FormFactor[]> = {
  phone: ['phone'],
  tablet: ['tablet', 'phone'],
  desktop: ['desktop', 'tablet', 'phone'],
  wall: ['wall', 'desktop', 'tablet', 'phone'],
};

/** Picks the value for a form factor, falling back to the next smaller one that is defined. */
export function pickResponsive<T>(formFactor: FormFactor, values: ResponsiveValues<T>): T {
  for (const candidate of FALLBACK_ORDER[formFactor]) {
    const value = values[candidate];
    if (value !== undefined) {
      return value as T;
    }
  }
  return values.phone;
}

/** `useResponsiveValue({ phone: 1, tablet: 2, desktop: 3 })` → the value for the current form factor. */
export function useResponsiveValue<T>(values: ResponsiveValues<T>, options?: FormFactorOptions): T {
  const { formFactor } = useFormFactor(options);
  return pickResponsive(formFactor, values);
}

type ResponsiveProps = ResponsiveValues<React.ReactNode> & FormFactorOptions;

/**
 * Renders the branch for the current form factor; missing branches fall back to the next smaller one.
 * `<Responsive phone={<List />} tablet={<SplitView />} />`
 */
export function Responsive({ kiosk, ...values }: ResponsiveProps) {
  const node = useResponsiveValue<React.ReactNode>(values, { kiosk });
  return <>{node}</>;
}
