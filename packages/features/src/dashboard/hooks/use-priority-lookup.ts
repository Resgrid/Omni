import { resolvePriority } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallPriorityResultData } from '@resgrid/models';
import { useMemo } from 'react';

import { normalizeColor } from '../lib/format';

export interface PriorityDisplay {
  label: string;
  color: string;
}

/** Translated name and colour of a call priority (the department's priority, else the built-in one). */
export function usePriorityLookup(priorities: readonly CallPriorityResultData[]): (priorityId: number) => PriorityDisplay {
  const { t } = useTranslation();
  return useMemo(
    () => (priorityId: number) => {
      const option = resolvePriority(priorities, priorityId);
      return option ? { label: option.isLabelKey ? t(option.label) : option.label, color: normalizeColor(option.color) } : { label: t('common.unknown'), color: '#888888' };
    },
    [priorities, t]
  );
}
