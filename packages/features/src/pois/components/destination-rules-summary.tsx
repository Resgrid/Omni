import { usePoisStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { SuggestedDestinationsResultData } from '@resgrid/models';
import { Button, ButtonText, HStack, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo } from 'react';

import type { CapabilityNamer } from '../hooks/use-capability-names';

/** The set-aside reasons the server sends (Core `DestinationRuleSetAsideReasons`), and what each says. */
const SET_ASIDE_REASON_KEYS: ReadonlyMap<string, string> = new Map([
  ['typeconflict', 'pois.suggestions.set_aside_type_conflict'],
  ['typesremoved', 'pois.suggestions.set_aside_types_removed'],
]);

export interface DestinationRulesSummaryProps {
  /** The destination rules' answer for the call (and unit). */
  data: SuggestedDestinationsResultData;
  capabilityName: CapabilityNamer;
  testID: string;
}

/**
 * What the destination rules made of the call, in a line or two (the web panel's "Rules: Burns · Needs: Burn Center"):
 * the rules that apply, the destination types they allow, the capabilities required and preferred, and the rules that
 * matched but were set aside, with why. Nothing shows when no rule matched.
 */
export const DestinationRulesSummary: React.FC<DestinationRulesSummaryProps> = ({ data, capabilityName, testID }) => {
  const { t } = useTranslation();
  const requirements = data.Requirements;
  const poiTypes = usePoisStore((state) => state.poiTypes);
  const typeIds = useMemo(() => requirements?.PoiTypeIds ?? [], [requirements]);

  // The allowed types by name: the answer's own destinations name theirs, the department's POI types the rest.
  const typeNames = useMemo(() => {
    const names = new Map<number, string>();

    for (const type of poiTypes) if (type.Name) names.set(Number(type.PoiTypeId), type.Name);

    for (const row of data.Destinations) if (row.Poi?.PoiTypeName) names.set(Number(row.Poi.PoiTypeId), row.Poi.PoiTypeName);

    return names;
  }, [data.Destinations, poiTypes]);

  const unnamedType = typeIds.some((id) => !typeNames.has(Number(id)));

  useEffect(() => {
    if (unnamedType) void usePoisStore.getState().fetchPoiTypes();
  }, [unnamedType]);

  if (!requirements) return null;

  const rules = requirements.Rules ?? [];
  // A type no list names yet is left out rather than shown as an id.
  const types = typeIds.flatMap((id) => typeNames.get(Number(id)) ?? []);
  const required = requirements.RequiredCapabilityIds ?? [];
  const preferred = requirements.PreferredCapabilityIds ?? [];

  const parts = [
    rules.length > 0 ? t('pois.suggestions.rules', { names: rules.map((rule) => rule.Name).join(', ') }) : null,
    types.length > 0 ? t('pois.suggestions.types', { names: types.join(', ') }) : null,
    required.length > 0 ? t('pois.suggestions.needs', { names: required.map((id) => capabilityName(id)).join(', ') }) : null,
    preferred.length > 0 ? t('pois.suggestions.prefers', { names: preferred.map((id) => capabilityName(id)).join(', ') }) : null,
  ].filter((part): part is string => !!part);

  const setAside = (requirements.SetAsideRules ?? []).map((rule) => {
    const reasonKey = SET_ASIDE_REASON_KEYS.get((rule.Reason ?? '').trim().toLowerCase());

    return reasonKey ? t('pois.suggestions.set_aside_rule', { name: rule.Name, reason: t(reasonKey) }) : rule.Name;
  });

  if (parts.length === 0 && setAside.length === 0) return null;

  return (
    <VStack className="mt-1" testID={testID}>
      {parts.length > 0 ? (
        <Text className="text-xs text-typography-600" testID={`${testID}-applied`}>
          {parts.join(' · ')}
        </Text>
      ) : null}
      {setAside.length > 0 ? (
        <Text className="text-xs text-typography-500" testID={`${testID}-set-aside`}>
          {t('pois.suggestions.set_aside', { names: setAside.join('; ') })}
        </Text>
      ) : null}
    </VStack>
  );
};

/**
 * The destination rules could not answer for the call as it is now (the first ask, or a re-ask after a change of type,
 * priority or location): said in one line with a retry, and no earlier answer is shown in its place.
 */
export const SuggestionsFailedLine: React.FC<{ onRetry: () => void; testID: string }> = ({ onRetry, testID }) => {
  const { t } = useTranslation();

  return (
    <HStack space="sm" className="mt-1 items-center" testID={testID}>
      <Text className="flex-1 text-xs text-error-700">{t('pois.suggestions.failed')}</Text>
      <Button size="sm" variant="outline" onPress={onRetry} accessibilityLabel={t('common.retry')} testID={`${testID}-retry`}>
        <ButtonText>{t('common.retry')}</ButtonText>
      </Button>
    </HStack>
  );
};
