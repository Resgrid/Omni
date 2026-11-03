import { getUdfDefinition, getUdfValues } from '@resgrid/api';
import { getDataApiContext, hasDataApiContext, unwrapItem, unwrapList } from '@resgrid/data';
import type { UdfFieldResultData, UdfFieldValueInput } from '@resgrid/models';
import { useEffect, useState } from 'react';

import { useCallFormHookPoints } from '../hook-points';
import { isUdfFieldShown } from '../lib/call-form';

/** Core UdfEntityType.Call. */
const CALL_ENTITY_TYPE = 0;

export interface CallUdfFields {
  /** The custom fields the form shows, once loaded; null until then, or when they cannot be shown. */
  fields: UdfFieldResultData[] | null;
  /** Every shown field's starting value: its default, or on an edit what the call stores. */
  initialValues: UdfFieldValueInput[] | null;
}

const loadDefinition = async (): Promise<UdfFieldResultData[]> => unwrapItem(await getUdfDefinition(getDataApiContext(), { entityType: CALL_ENTITY_TYPE }))?.Fields ?? [];

/**
 * The department's call custom fields (Dispatch `UdfFieldsRenderer`): enabled fields shown on mobile or required, each
 * starting at its default; an edit starts from the values the call stores. When an edit's stored values cannot be
 * read, no fields are shown, so a save cannot write defaults over what the call holds. A `loadUdfFields` hook point
 * replaces the definition lookup.
 */
export function useCallUdfFields(enabled: boolean, callId?: string): CallUdfFields {
  const { loadUdfFields } = useCallFormHookPoints();
  const [state, setState] = useState<CallUdfFields>({ fields: null, initialValues: null });

  useEffect(() => {
    if (!enabled || (!loadUdfFields && !hasDataApiContext())) return undefined;
    let cancelled = false;

    const load = async (): Promise<CallUdfFields> => {
      const fields = (await (loadUdfFields ?? loadDefinition)()).filter(isUdfFieldShown);
      const values = new Map(fields.map((field) => [field.UdfFieldId, field.DefaultValue ?? '']));

      if (callId && fields.length > 0) {
        for (const stored of unwrapList(await getUdfValues(getDataApiContext(), { entityType: CALL_ENTITY_TYPE, entityId: callId }))) if (values.has(stored.UdfFieldId)) values.set(stored.UdfFieldId, stored.Value ?? '');
      }

      return { fields, initialValues: fields.map((field) => ({ UdfFieldId: field.UdfFieldId, Value: values.get(field.UdfFieldId) ?? '' })) };
    };

    load()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ fields: null, initialValues: null });
      });

    return () => {
      cancelled = true;
    };
  }, [callId, enabled, loadUdfFields]);

  return state;
}
