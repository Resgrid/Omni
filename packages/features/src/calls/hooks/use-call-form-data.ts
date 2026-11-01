import { getAllCallQuickTemplates, getNewCallData, getNewCallFieldPolicy } from '@resgrid/api';
import { getDataApiContext, hasDataApiContext, unwrapItem, unwrapList, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import type { CallQuickTemplateResultData, GroupResultData, NewCallFieldRuleData, PersonnelInfoResultData, RoleResultData, UnitResultData } from '@resgrid/models';
import { useEffect, useMemo, useState } from 'react';

import { createFieldPolicy, type NewCallFieldPolicy } from '../lib/field-policy';

/*
 * Reference data the call form reads that @resgrid/data does not hold yet (field policy, quick templates, the
 * dispatch pickers' roles). Each read is kept for the session so a form opened offline still has the last answer;
 * TODO(data): move these into persisted @resgrid/data stores (calls store: policy, templates, GetNewCallData
 * Personnel/Groups/Units/Roles) so they hydrate at shift start like the rest of the working set.
 */

let policyCache: NewCallFieldRuleData[] | null = null;
let templatesCache: CallQuickTemplateResultData[] | null = null;
let recipientsCache: DispatchRecipients | null = null;

/** Test helper: forgets the session caches. */
export function resetCallFormDataCachesForTests(): void {
  policyCache = null;
  templatesCache = null;
  recipientsCache = null;
}

/** The department's new-call field policy; fail-open while loading, offline or on error (the server enforces it on save). */
export function useNewCallFieldPolicy(): NewCallFieldPolicy {
  const [rules, setRules] = useState<NewCallFieldRuleData[] | null>(policyCache);
  const [isLoaded, setIsLoaded] = useState(policyCache !== null);

  useEffect(() => {
    let cancelled = false;
    if (!hasDataApiContext()) {
      setIsLoaded(true);
      return undefined;
    }
    getNewCallFieldPolicy(getDataApiContext())
      .then((result) => {
        const next = unwrapItem(result)?.Rules ?? [];
        policyCache = next;
        if (!cancelled) setRules(next);
      })
      .catch(() => {
        // Fail open: keep the last known rules (or the stock form) rather than hiding fields the caller may need.
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => createFieldPolicy(rules, isLoaded), [rules, isLoaded]);
}

/** Enabled call quick templates (Dispatch call templates). */
export function useCallTemplates(enabled: boolean): { templates: CallQuickTemplateResultData[]; isLoading: boolean } {
  const [templates, setTemplates] = useState<CallQuickTemplateResultData[]>(templatesCache ?? []);
  const [isLoading, setIsLoading] = useState(enabled && templatesCache === null);

  useEffect(() => {
    if (!enabled || !hasDataApiContext()) return undefined;
    let cancelled = false;
    setIsLoading(templatesCache === null);
    getAllCallQuickTemplates(getDataApiContext())
      .then((result) => {
        const next = unwrapList(result).filter((template) => !template.IsDisabled);
        templatesCache = next;
        if (!cancelled) setTemplates(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { templates, isLoading };
}

export interface DispatchRecipients {
  personnel: PersonnelInfoResultData[];
  groups: GroupResultData[];
  roles: RoleResultData[];
  units: UnitResultData[];
}

/** Dispatch picker lists (`Dispatch/GetNewCallData`), falling back to the persisted personnel/unit rosters offline. */
export function useDispatchRecipients(enabled: boolean): { recipients: DispatchRecipients; isLoading: boolean } {
  const storePersonnel = usePersonnelStore((state) => state.personnel);
  const storeGroups = usePersonnelStore((state) => state.groups);
  const storeUnits = useUnitsStore((state) => state.units);
  const [fetched, setFetched] = useState<DispatchRecipients | null>(recipientsCache);
  const [isLoading, setIsLoading] = useState(enabled && recipientsCache === null);

  useEffect(() => {
    if (!enabled || !hasDataApiContext()) return undefined;
    let cancelled = false;
    getNewCallData(getDataApiContext())
      .then((result) => {
        const data = unwrapItem(result);
        if (!data) return;
        const next: DispatchRecipients = { personnel: data.Personnel ?? [], groups: data.Groups ?? [], roles: data.Roles ?? [], units: data.Units ?? [] };
        recipientsCache = next;
        if (!cancelled) setFetched(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const recipients = useMemo<DispatchRecipients>(() => fetched ?? { personnel: storePersonnel, groups: storeGroups, roles: [], units: storeUnits }, [fetched, storePersonnel, storeGroups, storeUnits]);
  return { recipients, isLoading };
}
