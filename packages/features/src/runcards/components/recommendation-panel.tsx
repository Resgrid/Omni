import { useTranslation } from '@resgrid/i18n';
import type { DispatchRecommendationResultData, UnitRecommendationData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonSpinner, ButtonText, HStack, Pressable, Spinner, Text, VStack } from '@resgrid/ui';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ClipboardList, MoveRight, RefreshCw } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecommendationConditionsProps } from '../lib/recommendation-types';
import { effectiveUnitResponseCodeId } from '../lib/run-card-conditions';
import { dispatchModeKey, hasRecommendationContent, personnelDetailParts, selectionReasonKey, shortfallReasonKey, unitDetailParts, unitStatusColors } from '../lib/run-cards';
import { ResponseCodeChip } from './response-code-chip';
import { RunCardDecisionSection } from './run-card-decision-section';

export interface RecommendationPanelProps {
  recommendation: DispatchRecommendationResultData | null;
  isLoading: boolean;
  hasError: boolean;
  /** True once a fetch settled — distinguishes "not asked yet" from "asked, nothing matched". */
  hasFetched: boolean;
  isApplied: boolean;
  onApply: () => void;
  onRefresh: () => void;
  /** Shown when a card matched but there is nothing to add (a call that already covers its run card). */
  coveredMessage?: string;
  /** Adding resources to a call already out: the auto-dispatch badge and explainer are left out. */
  isExistingCall?: boolean;
  conditions?: RecommendationConditionsProps;
  testID?: string;
}

const ACCENT = '#2563eb';
const MUTED = '#737373';

const Icon: React.FC<{ children: React.ReactNode }> = ({ children }) => <View>{children}</View>;

/** The code a recommended unit goes with and, when the department has codes, a picker to change it. */
const UnitResponseCodePicker: React.FC<{ unit: UnitRecommendationData; conditions: RecommendationConditionsProps; testID: string }> = ({ unit, conditions, testID }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const codes = conditions.responseCodes ?? [];
  const canPick = codes.length > 0 && !!conditions.onUnitResponseCodeChange;
  const effectiveId = effectiveUnitResponseCodeId(unit, conditions.unitResponseCodes);
  // A proposed code the catalog no longer lists (retired since) still shows as the proposal named it.
  const picked = effectiveId !== null ? codes.find((code) => code.Id === effectiveId) : undefined;
  const isProposal = effectiveId !== null && effectiveId === (unit.ResponseCodeId ?? null);
  const chipCode = picked?.Code ?? (isProposal ? unit.ResponseCode : null);
  const chipName = picked?.Name ?? (isProposal ? unit.ResponseCodeName : null);
  const chipColor = picked?.Color ?? (isProposal ? unit.ResponseCodeColor : null);

  if (!canPick) return chipCode ? <ResponseCodeChip code={chipCode} name={chipName} color={chipColor} testID={`${testID}-code`} /> : null;

  const choose = (codeId: number | null) => {
    conditions.onUnitResponseCodeChange?.(unit.UnitId, codeId);
    setIsOpen(false);
  };

  return (
    <VStack space="xs" className="items-end">
      {chipCode ? (
        <ResponseCodeChip code={chipCode} name={chipName} color={chipColor} onPress={() => setIsOpen((open) => !open)} testID={`${testID}-code`} />
      ) : (
        <Pressable onPress={() => setIsOpen((open) => !open)} accessibilityRole="button" testID={`${testID}-code-add`}>
          <View style={styles.addCode} className="border-outline-400">
            <Text className="text-xs text-typography-500">{t('run_cards.conditions.response_code_add')}</Text>
          </View>
        </Pressable>
      )}
      {isOpen ? (
        <HStack space="xs" className="flex-wrap justify-end" testID={`${testID}-code-options`}>
          {codes.map((code) => (
            <ResponseCodeChip
              key={`rc-code-${unit.UnitId}-${code.Id}`}
              code={code.Code}
              name={code.Name}
              color={code.Color}
              isSelected={code.Id === effectiveId}
              onPress={() => choose(code.Id)}
              testID={`${testID}-code-option-${code.Id}`}
            />
          ))}
          <Pressable onPress={() => choose(null)} accessibilityRole="button" testID={`${testID}-code-option-none`}>
            <View style={StyleSheet.flatten([styles.noneOption, effectiveId === null ? styles.noneSelected : null])} className="border-outline-300">
              <Text className="text-xs text-typography-500">{t('run_cards.conditions.response_code_none')}</Text>
            </View>
          </Pressable>
        </HStack>
      ) : null}
    </VStack>
  );
};

/** A recommended unit's status in the status's own colours (outlined when it has none). */
const UnitStatusBadge: React.FC<{ unit: UnitRecommendationData; testID: string }> = ({ unit, testID }) => {
  if (!unit.CurrentStatusText) return null;
  const colors = unitStatusColors(unit);
  return (
    <View style={StyleSheet.flatten([styles.statusBadge, colors ? { backgroundColor: colors.backgroundColor } : null])} className={colors ? undefined : 'border-outline-300'} testID={testID}>
      <Text className={colors ? 'text-xs font-medium' : 'text-xs font-medium text-typography-500'} style={colors ? { color: colors.color } : undefined}>
        {unit.CurrentStatusText}
      </Text>
    </View>
  );
};

/**
 * Explainability panel for a run card recommendation (Dispatch baseline). Deliberately advisory: applying only pre-checks
 * the dispatch selection the dispatcher was going to make by hand, so a wrong recommendation costs a click to undo.
 * Callers gate it behind run cards being enabled (`useIsRunCardsEnabled`).
 */
export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  isLoading,
  hasError,
  hasFetched,
  isApplied,
  onApply,
  onRefresh,
  coveredMessage,
  isExistingCall = false,
  conditions,
  testID = 'run-card-recommendation-panel',
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const hasContent = useMemo(() => hasRecommendationContent(recommendation), [recommendation]);
  const showAutoDispatch = !isExistingCall && !!recommendation?.AutoDispatch;
  const showConditions = !!conditions?.enabled;
  const decision = showConditions ? (recommendation?.Decision ?? null) : null;
  const canReevaluate = !!decision?.Pinned && !!conditions?.onReevaluate;
  const unitCount = recommendation?.Units?.length ?? 0;
  const personnelCount = recommendation?.Personnel?.length ?? 0;
  const canApply = unitCount > 0 || personnelCount > 0;

  const refreshButton = (id: string) => (
    <Pressable onPress={onRefresh} accessibilityRole="button" accessibilityLabel={t('common.refresh')} testID={`${testID}-${id}`} className="p-1">
      <Icon>
        <RefreshCw size={18} color={MUTED} />
      </Icon>
    </Pressable>
  );

  if (isLoading) {
    return (
      <View className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={`${testID}-loading`}>
        <HStack space="md" className="items-center">
          <Spinner size="small" />
          <Text className="text-sm text-typography-500">{t('run_cards.checking')}</Text>
        </HStack>
      </View>
    );
  }

  if (hasError) {
    // A failed lookup must not read as "no run card applies", nor block the manual flow: hence the soft tone.
    return (
      <View className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={`${testID}-error`}>
        <HStack space="md" className="items-center justify-between">
          <Text className="flex-1 text-sm text-warning-600">{t('run_cards.lookup_failed')}</Text>
          <Pressable onPress={onRefresh} accessibilityRole="button" testID={`${testID}-retry`}>
            <Text className="text-sm font-semibold text-primary-600">{t('common.retry')}</Text>
          </Pressable>
        </HStack>
      </View>
    );
  }

  if (hasFetched && !hasContent && coveredMessage && recommendation?.MatchedRunCardId) {
    return (
      <View className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={`${testID}-covered`}>
        <HStack space="md" className="items-center justify-between">
          <HStack space="sm" className="flex-1 items-center">
            <Icon>
              <ClipboardList size={18} color={ACCENT} />
            </Icon>
            <VStack className="flex-1">
              <Text className="font-semibold">{recommendation.MatchedRunCardName || t('run_cards.title')}</Text>
              <Text className="text-xs text-typography-500">{coveredMessage}</Text>
            </VStack>
          </HStack>
          {refreshButton('refresh')}
        </HStack>
        {canReevaluate ? (
          <View className="mt-2 items-start">
            <Button size="xs" variant="outline" action="secondary" onPress={conditions?.onReevaluate} isDisabled={!!conditions?.isReevaluating} testID={`${testID}-decision-reevaluate`}>
              {conditions?.isReevaluating ? <ButtonSpinner /> : null}
              <ButtonText>{t('run_cards.conditions.reevaluate')}</ButtonText>
            </Button>
          </View>
        ) : null}
      </View>
    );
  }

  // Not asked yet, or no card matches this call: stay out of the way rather than showing an empty box.
  if (!hasFetched || !hasContent || !recommendation) return null;

  return (
    <View className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={testID}>
      <Pressable onPress={() => setIsExpanded((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} testID={`${testID}-header`}>
        <HStack className="items-center justify-between">
          <HStack space="sm" className="flex-1 items-center">
            <Icon>
              <ClipboardList size={18} color={ACCENT} />
            </Icon>
            <VStack className="flex-1">
              <Text className="font-semibold">{recommendation.MatchedRunCardName || t('run_cards.title')}</Text>
              <Text className="text-xs text-typography-500">{t('run_cards.summary', { units: unitCount, personnel: personnelCount })}</Text>
            </VStack>
          </HStack>
          <Icon>{isExpanded ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}</Icon>
        </HStack>
      </Pressable>

      {isExpanded ? (
        <VStack space="md" className="mt-3">
          <HStack space="sm" className="flex-wrap items-center">
            <Badge action="info" testID={`${testID}-mode`}>
              <BadgeText>{t(dispatchModeKey(recommendation.ModeUsed))}</BadgeText>
            </Badge>
            {recommendation.AlarmLevel > 1 ? (
              <Badge action="warning">
                <BadgeText>{t('run_cards.alarm_level', { level: recommendation.AlarmLevel })}</BadgeText>
              </Badge>
            ) : null}
            {showAutoDispatch ? (
              <Badge action="success" testID={`${testID}-auto`}>
                <BadgeText>{t('run_cards.auto_dispatch')}</BadgeText>
              </Badge>
            ) : null}
          </HStack>
          {/* Auto-dispatch happens server-side at call creation; saying so explains why applying is optional. */}
          {showAutoDispatch ? <Text className="text-xs text-typography-500">{t('run_cards.auto_dispatch_explainer')}</Text> : null}

          {decision ? <RunCardDecisionSection decision={decision} onReevaluate={canReevaluate ? conditions?.onReevaluate : undefined} isReevaluating={conditions?.isReevaluating} testID={testID} /> : null}

          {unitCount > 0 ? (
            <VStack space="xs">
              <Text className="text-xs font-semibold uppercase text-typography-500">{t('run_cards.units_section', { count: unitCount })}</Text>
              {recommendation.Units.map((unit) => {
                const details = unitDetailParts(unit);
                return (
                  <View key={`rc-unit-${unit.UnitId}`} className="rounded border border-outline-200 p-2" testID={`${testID}-unit-${unit.UnitId}`}>
                    <HStack space="sm" className="items-center justify-between">
                      <VStack className="flex-1">
                        <HStack space="sm" className="flex-wrap items-center">
                          <Text className="text-sm font-medium">{unit.UnitName}</Text>
                          <UnitStatusBadge unit={unit} testID={`${testID}-unit-${unit.UnitId}-status`} />
                        </HStack>
                        {showConditions && unit.RowLabel ? (
                          <Text className="text-xs font-medium text-primary-600" testID={`${testID}-unit-${unit.UnitId}-row`}>
                            {t('run_cards.conditions.fills_row', { row: unit.RowLabel })}
                          </Text>
                        ) : null}
                        {details.length > 0 ? <Text className="text-xs text-typography-500">{details.join(' · ')}</Text> : null}
                      </VStack>
                      <VStack space="xs" className="items-end">
                        {showConditions && conditions ? <UnitResponseCodePicker unit={unit} conditions={conditions} testID={`${testID}-unit-${unit.UnitId}`} /> : null}
                        <Text className="text-xs text-typography-500">{t(selectionReasonKey(unit.SelectionReason))}</Text>
                        {unit.LocationIsStale ? <Text className="text-xs text-warning-600">{t('run_cards.stale_location')}</Text> : null}
                      </VStack>
                    </HStack>
                  </View>
                );
              })}
            </VStack>
          ) : null}

          {personnelCount > 0 ? (
            <VStack space="xs">
              <Text className="text-xs font-semibold uppercase text-typography-500">{t('run_cards.personnel_section', { count: personnelCount })}</Text>
              {recommendation.Personnel.map((person) => {
                const details = personnelDetailParts(person);
                return (
                  <View key={`rc-person-${person.UserId}`} className="rounded border border-outline-200 p-2" testID={`${testID}-person-${person.UserId}`}>
                    <HStack space="sm" className="items-center justify-between">
                      <VStack className="flex-1">
                        <Text className="text-sm font-medium">{person.Name}</Text>
                        {showConditions && person.RowLabel ? (
                          <Text className="text-xs font-medium text-primary-600" testID={`${testID}-person-${person.UserId}-row`}>
                            {t('run_cards.conditions.fills_row', { row: person.RowLabel })}
                          </Text>
                        ) : null}
                        {details.length > 0 ? <Text className="text-xs text-typography-500">{details.join(' · ')}</Text> : null}
                      </VStack>
                      <VStack space="xs" className="items-end">
                        {/* Codes are posted per unit only, so a person's proposed code is shown, not picked. */}
                        {showConditions ? <ResponseCodeChip code={person.ResponseCode} name={person.ResponseCodeName} color={person.ResponseCodeColor} testID={`${testID}-person-${person.UserId}-code`} /> : null}
                        <Text className="text-xs text-typography-500">{t(selectionReasonKey(person.SelectionReason))}</Text>
                        {person.LocationIsStale ? <Text className="text-xs text-warning-600">{t('run_cards.stale_location')}</Text> : null}
                      </VStack>
                    </HStack>
                  </View>
                );
              })}
            </VStack>
          ) : null}

          {/* Shortfalls are the point of this panel on a bad day: the card asked for three engines, one was found. */}
          {(recommendation.Shortfalls?.length ?? 0) > 0 ? (
            <VStack space="xs" testID={`${testID}-shortfalls`}>
              <HStack space="xs" className="items-center">
                <Icon>
                  <AlertTriangle size={14} color="#d97706" />
                </Icon>
                <Text className="text-xs font-semibold uppercase text-warning-600">{t('run_cards.shortfalls_section')}</Text>
              </HStack>
              {recommendation.Shortfalls.map((shortfall) => (
                <HStack key={`rc-short-${shortfall.IsUnitRequirement ? 'u' : 'p'}-${shortfall.RequirementScope ?? 0}-${shortfall.RequirementId}`} space="xs" className="flex-wrap items-center">
                  <Text className="text-xs text-warning-600">
                    {t('run_cards.shortfall_line', { name: shortfall.TypeOrRoleName, filled: shortfall.FilledCount, required: shortfall.RequiredCount, reason: t(shortfallReasonKey(shortfall.Reason)) })}
                  </Text>
                  {showConditions && shortfall.Outstanding ? (
                    <Badge action="warning" testID={`${testID}-shortfall-${shortfall.RequirementId}-awaiting`}>
                      <BadgeText>{t('run_cards.conditions.awaiting_marker')}</BadgeText>
                    </Badge>
                  ) : null}
                </HStack>
              ))}
            </VStack>
          ) : null}

          {(recommendation.MoveUps?.length ?? 0) > 0 ? (
            <VStack space="xs" testID={`${testID}-moveups`}>
              <HStack space="xs" className="items-center">
                <Icon>
                  <MoveRight size={14} color={MUTED} />
                </Icon>
                <Text className="text-xs font-semibold uppercase text-typography-500">{t('run_cards.move_ups_section')}</Text>
              </HStack>
              {/* Advisory only — move-ups are never dispatched by the engine. */}
              {recommendation.MoveUps.map((moveUp, index) => (
                <Text key={`rc-moveup-${moveUp.StationGroupId}-${index}`} className="text-xs text-typography-500">
                  {t('run_cards.move_up_line', {
                    station: moveUp.StationGroupName,
                    resource: moveUp.SuggestedUnitName || moveUp.SuggestedUserName || t('run_cards.move_up_no_donor'),
                    available: moveUp.AvailableAfterDispatch,
                    minimum: moveUp.MinimumRequired,
                  })}
                </Text>
              ))}
            </VStack>
          ) : null}

          {(recommendation.Notes?.length ?? 0) > 0 ? (
            <VStack testID={`${testID}-notes`}>
              <Text className="text-xs font-semibold uppercase text-typography-500">{t('run_cards.notes_section')}</Text>
              {recommendation.Notes.map((note, index) => (
                <Text key={`rc-note-${index}`} className="text-xs text-typography-400">
                  {note}
                </Text>
              ))}
            </VStack>
          ) : null}

          {/* Refresh stays even with nothing to apply: a shortfall-only answer is the one most worth re-running. */}
          <HStack space="sm" className="items-center">
            {canApply ? (
              <Button variant={isApplied ? 'outline' : 'solid'} action="primary" onPress={onApply} className="flex-1" testID={`${testID}-apply`}>
                {isApplied ? (
                  <Icon>
                    <Check size={16} color={ACCENT} />
                  </Icon>
                ) : null}
                <ButtonText>{isApplied ? t('run_cards.applied') : t('run_cards.apply')}</ButtonText>
              </Button>
            ) : null}
            {refreshButton('refresh')}
          </HStack>
        </VStack>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  addCode: { borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 6, paddingVertical: 2 },
  noneOption: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  noneSelected: { borderWidth: 2, borderColor: '#3b82f6' },
  statusBadge: { borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 2 },
});
