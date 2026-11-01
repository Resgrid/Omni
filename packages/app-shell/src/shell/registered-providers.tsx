import React, { type ReactNode } from 'react';

import { useShellProviders } from '../runtime/slots';

/**
 * Nests the providers registered with `registerShellProvider` around the signed-in frame, outermost first (lowest
 * `order`). With none registered it renders its children unchanged.
 */
export function RegisteredProviders({ children }: { children?: ReactNode }) {
  const entries = useShellProviders();
  return (
    <>
      {entries.reduceRight<ReactNode>((child, entry) => {
        const Provider = entry.component;
        return <Provider key={entry.id}>{child}</Provider>;
      }, children)}
    </>
  );
}
