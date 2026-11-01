import { useTerm } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';

import { WIDGET_LABEL_KEYS, WIDGET_TERM_KEYS, type WidgetType } from '../lib/widget-types';

/** A widget's display name: the department's own word for the module when it renamed it, else the translation. */
export function useWidgetTitle(type: WidgetType): string {
  const { t } = useTranslation();
  return useTerm(WIDGET_TERM_KEYS[type] ?? null, t(WIDGET_LABEL_KEYS[type]));
}
