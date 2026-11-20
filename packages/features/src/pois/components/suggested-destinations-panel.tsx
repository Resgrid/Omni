import { formatDistance, formatEta } from '@resgrid/features/calls/lib/dispatch-board';
import { useDepartmentConfig } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData, SuggestedDestinationResultData } from '@resgrid/models';
import { Box, Button, ButtonText, HStack, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useRef, useState } from 'react';

import { type CapabilityNamer, useCapabilityNames } from '../hooks/use-capability-names';
import { useSuggestedDestinations } from '../hooks/use-suggested-destinations';
import { decideDestinationFill, type DestinationFillState, initialDestinationFillState, observeDestinationChange, resumeDestinationFill, withdrawDestinationFill } from '../lib/destination-fill';
import { configuredDestinationSuggestionMode } from '../lib/destination-suggestion-mode';
import { type DestinationOrigin, requiredCapabilitiesDown } from '../lib/poi-availability';
import { poiLabel } from '../lib/poi-filters';
import { PoiAvailabilityBadge } from './destination-parts';
import { DestinationRulesSummary, SuggestionsFailedLine } from './destination-rules-summary';

/** How many suggestions the panel lists (the best one first). */
export const SUGGESTED_DESTINATIONS_SHOWN = 5;

export interface SuggestedDestinationsPanelProps {
  /** The incident location; the panel shows nothing without one. */
  origin: DestinationOrigin | null;
  /** The call type's name as the form holds it. */
  callType?: string | null;
  /** The call priority (the call's Priority value). */
  priority?: number | null;
  /** An existing call (update form). */
  callId?: number | string | null;
  /** The destination POI the form holds now. */
  selectedPoiId: number | null;
  /**
   * The form may fill an empty destination with the best suggestion ("Suggest and fill"): a new call whose destination is
   * a POI and holds no address, point or route end. The panel still only fills what is empty or what it filled itself.
   */
  canFill: boolean;
  /**
   * Sets the form's destination POI; null takes back a destination the panel filled that no longer fits. A pick (Use) also
   * passes the suggested POI, for forms that name the destination after it.
   */
  onSelect: (poiId: number | null, poi?: PoiResultData | null) => void;
  /** True when the form's destination list can show the POI (default: any). */
  isSelectable?: (poiId: number) => boolean;
  /**
   * The form's "Suggest and fill" state, held by the form so it outlives this panel: switching the destination kind to an
   * address or point and back unmounts the panel, and a pick or clear by hand before that must still stop the filling.
   * Without it the panel keeps its own (a form that never unmounts it).
   */
  fillState?: React.RefObject<DestinationFillState | null>;
  testID?: string;
}

const anySelectable = (): boolean => true;

/**
 * Suggested destinations under the call form's destination field (Mapping -> Destination Rules on the web): what the
 * call needs (the rules that apply and those set aside, the destination types, required and preferred capabilities) and
 * the best destinations for it with drive time and distance, availability and what each lacks, each with a Use button.
 * With "Suggest and fill" it fills an empty destination and follows changes of type, priority or location until the
 * dispatcher picks or clears one by hand. Only the answer for the form's current inputs shows: while a new one loads, or
 * when it could not be had (with a retry), the earlier list is gone. Nothing shows while the department's suggestions are
 * off.
 */
export const SuggestedDestinationsPanel: React.FC<SuggestedDestinationsPanelProps> = ({
  origin,
  callType = null,
  priority = null,
  callId = null,
  selectedPoiId,
  canFill,
  onSelect,
  isSelectable = anySelectable,
  fillState,
  testID = 'suggested-destinations',
}) => {
  const { t } = useTranslation();
  const config = useDepartmentConfig();
  const capabilityName = useCapabilityNames();
  const { data, isLoading, failed, isOff, retry } = useSuggestedDestinations({ origin, callType, priority, callId, configMode: configuredDestinationSuggestionMode(config), enabled: true });
  const ownFill = useRef<DestinationFillState | null>(null);
  const fill = fillState ?? ownFill;
  const mounted = useRef(false);
  // The destination this filled in, for the "filled in" note (the ref drives the decisions, this the render).
  const [filledId, setFilledId] = useState<number | null>(null);
  const fillNow = (): DestinationFillState => fill.current ?? initialDestinationFillState(selectedPoiId);

  // A destination the dispatcher set (picker, clear, a route's end) stops the filling for this form. Shown again after a
  // switch of the destination kind, the panel picks up the form's state as it was.
  useEffect(() => {
    fill.current = mounted.current ? observeDestinationChange(fillNow(), selectedPoiId) : resumeDestinationFill(fill.current, selectedPoiId);
    mounted.current = true;
    setFilledId(fill.current.autoFilledId);
    // The fill state is a ref; only the selection drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoiId]);

  useEffect(() => {
    if (!data && !failed) return;

    // No answer for the current inputs: a destination filled from an earlier one comes back out, nothing is filled.
    const decision = data ? decideDestinationFill(fillNow(), { enabled: canFill, mode: data.Mode, selectedPoiId, suggestedPoiId: data.SuggestedPoiId, isSelectable }) : withdrawDestinationFill(fillNow(), selectedPoiId);

    fill.current = decision.state;
    setFilledId(decision.state.autoFilledId);

    if (decision.action.kind === 'fill') onSelect(decision.action.poiId);
    else if (decision.action.kind === 'clear') onSelect(null);
    // Decide once per answer (or failure); the selection is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, failed]);

  if (isOff || (!data && !isLoading && !failed)) return null;

  const pick = (poi: PoiResultData) => {
    fill.current = { autoFilledId: null, touched: true };
    setFilledId(null);
    onSelect(poi.PoiId, poi);
  };

  return (
    <Box className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3" testID={testID}>
      <Text className="text-sm font-semibold text-typography-700">{t('pois.suggestions.title')}</Text>
      {data ? <DestinationRulesSummary data={data} capabilityName={capabilityName} testID={`${testID}-requirements`} /> : null}
      {data && selectedPoiId !== null && filledId === selectedPoiId ? (
        <Text className="mt-1 text-xs text-info-700" testID={`${testID}-filled`}>
          {t('pois.suggestions.filled')}
        </Text>
      ) : null}
      {isLoading ? (
        <Text className="mt-1 text-xs text-typography-500" testID={`${testID}-loading`}>
          {t('pois.suggestions.loading')}
        </Text>
      ) : null}
      {failed ? <SuggestionsFailedLine onRetry={retry} testID={`${testID}-failed`} /> : null}
      {data && data.Destinations.length === 0 ? <Text className="mt-1 text-xs text-typography-500">{t('pois.suggestions.none')}</Text> : null}
      {data && data.Destinations.length > 0 && (data.SuggestedPoiId === null || data.SuggestedPoiId === undefined) ? (
        <Text className="mt-1 text-xs text-warning-700" testID={`${testID}-none-meet`}>
          {t('pois.suggestions.none_meet')}
        </Text>
      ) : null}
      {data
        ? data.Destinations.slice(0, SUGGESTED_DESTINATIONS_SHOWN).map((row) =>
            row.Poi ? (
              <SuggestionRow
                key={row.Poi.PoiId}
                row={row}
                isSuggested={data.SuggestedPoiId === row.Poi.PoiId}
                isSelected={selectedPoiId === row.Poi.PoiId}
                requiredIds={data.Requirements?.RequiredCapabilityIds ?? []}
                canUse={isSelectable(row.Poi.PoiId)}
                capabilityName={capabilityName}
                onUse={pick}
                testID={`${testID}-row-${row.Poi.PoiId}`}
              />
            ) : null
          )
        : null}
    </Box>
  );
};

interface SuggestionRowProps {
  row: SuggestedDestinationResultData;
  isSuggested: boolean;
  isSelected: boolean;
  /** The capabilities the call requires (a required one marked down at a destination is called out). */
  requiredIds: string[];
  canUse: boolean;
  capabilityName: CapabilityNamer;
  onUse: (poi: PoiResultData) => void;
  testID: string;
}

const SuggestionRow: React.FC<SuggestionRowProps> = ({ row, isSuggested, isSelected, requiredIds, canUse, capabilityName, onUse, testID }) => {
  const { t } = useTranslation();
  const poi = row.Poi;

  if (!poi) return null;

  const routed = row.TravelSeconds >= 0;

  const metrics = [routed ? formatEta(row.TravelSeconds) : null, formatDistance(routed && row.TravelDistanceMeters >= 0 ? row.TravelDistanceMeters : row.DistanceMeters)]
    .filter((part): part is string => !!part)
    .join(' · ');

  const missing = (row.MissingCapabilityIds ?? []).map((id) => capabilityName(id, poi));
  // A required capability the destination has but marked down now (Destination Availability): why it is not suggested.
  const down = requiredCapabilitiesDown(poi, requiredIds).map((id) => capabilityName(id, poi));
  const preferred = (row.PreferredCapabilityIds ?? []).map((id) => capabilityName(id, poi));

  return (
    <HStack space="sm" className={`mt-2 items-center rounded-lg p-2 ${isSuggested ? 'bg-info-50' : 'bg-background-50'}`} testID={testID}>
      <VStack className="flex-1">
        <HStack space="xs" className="flex-wrap items-center">
          <Text className="text-sm font-semibold text-typography-900" numberOfLines={1}>
            {poiLabel(poi)}
          </Text>
          {isSuggested ? <Text className="rounded-full bg-primary-500 px-2 py-0.5 text-xs text-typography-0">{t('pois.suggestions.suggested')}</Text> : null}
          <PoiAvailabilityBadge poi={poi} testID={`${testID}-availability`} />
        </HStack>
        {missing.length > 0 ? (
          <Text className="mt-1 self-start rounded-full bg-error-50 px-2 py-0.5 text-xs text-error-700" testID={`${testID}-missing`}>
            {t('pois.suggestions.missing', { names: missing.join(', ') })}
          </Text>
        ) : null}
        {down.length > 0 ? (
          <Text className="mt-1 self-start rounded-full bg-error-50 px-2 py-0.5 text-xs text-error-700" testID={`${testID}-down`}>
            {t('pois.suggestions.down', { names: down.join(', ') })}
          </Text>
        ) : null}
        {preferred.length > 0 ? (
          <HStack space="xs" className="mt-1 flex-wrap">
            {preferred.map((name) => (
              <Text key={name} className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700">
                {name}
              </Text>
            ))}
          </HStack>
        ) : null}
        <Text className="mt-1 text-xs text-typography-500" numberOfLines={1}>
          {[poi.PoiTypeName, poi.Address].filter((part) => !!part).join(' · ')}
        </Text>
      </VStack>
      <VStack className="items-end">
        {metrics ? (
          <Text className="text-xs font-semibold text-typography-700" testID={`${testID}-metrics`}>
            {metrics}
          </Text>
        ) : null}
        {isSelected ? (
          <Text className="mt-1 text-xs text-typography-500" testID={`${testID}-selected`}>
            {t('pois.suggestions.selected')}
          </Text>
        ) : canUse ? (
          <Button size="sm" className="mt-1" onPress={() => onUse(poi)} accessibilityLabel={t('pois.suggestions.use_label', { name: poiLabel(poi) })} testID={`${testID}-use`}>
            <ButtonText>{t('pois.suggestions.use')}</ButtonText>
          </Button>
        ) : null}
      </VStack>
    </HStack>
  );
};
