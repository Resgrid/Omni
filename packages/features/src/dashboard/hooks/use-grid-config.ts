import { useFormFactor } from '@resgrid/ui';
import { useMemo } from 'react';

import { computeGridConfig, type GridConfig } from '../lib/grid';

/**
 * The dashboard grid for the current form factor (phone, tablet, desktop, wall) and width. `containerWidth` — the
 * measured width of the grid's own container — wins over the window width (a permanent sidebar narrows the board).
 */
export function useGridConfig(containerWidth?: number | null): GridConfig {
  const { formFactor, width } = useFormFactor();
  const effectiveWidth = containerWidth && containerWidth > 0 ? containerWidth : width;
  return useMemo(() => computeGridConfig(effectiveWidth, formFactor), [effectiveWidth, formFactor]);
}
