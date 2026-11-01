import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { RecommendationOutcome, type RunCardConditionData, RunCardConditionResult, RunCardConditionType, type RunCardDecisionData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonSpinner, ButtonText, HStack, Text, VStack } from '@resgrid/ui';
import { AlertTriangle, GitBranch, Info, Pin, RefreshCw, Zap } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { conditionResultKey, fallbackStepKey, formatMarginSeconds, formatResponseSeconds, isConditionUncertain, operandDisplay, pinSourceKey, timeSourceKey } from '../lib/run-card-conditions';

export interface RunCardDecisionSectionProps {
  decision: RunCardDecisionData;
  /** Walks the decision graph again instead of using the pinned one; only for a call already out with a pinned decision. */
  onReevaluate?: () => void;
  isReevaluating?: boolean;
  testID: string;
}

const MUTED = '#737373';
const AMBER = '#d97706';

const SectionTitle: React.FC<{ icon: React.ReactNode; label: string; className?: string }> = ({ icon, label, className = 'text-typography-500' }) => (
  <HStack space="xs" className="items-center">
    <View>{icon}</View>
    <Text className={`text-xs font-semibold uppercase ${className}`}>{label}</Text>
  </HStack>
);

/** One tested condition: what it asked, which way it went, and the times it compared. */
const ConditionRow: React.FC<{ condition: RunCardConditionData; index: number; testID: string }> = ({ condition, index, testID }) => {
  const { t } = useTranslation();
  const none = t('run_cards.conditions.none_available');
  const noTime = t('run_cards.conditions.no_time');
  const detail =
    condition.ConditionType === RunCardConditionType.ArrivesBefore
      ? t('run_cards.conditions.arrives_before_detail', {
          subject: operandDisplay(condition.Subject, none),
          subjectTime: formatResponseSeconds(condition.Subject?.ResponseSeconds) ?? noTime,
          reference: operandDisplay(condition.Reference, none),
          referenceTime: formatResponseSeconds(condition.Reference?.ResponseSeconds) ?? noTime,
        })
      : condition.ConditionType === RunCardConditionType.AvailableWithin
        ? t('run_cards.conditions.available_within_detail', {
            count: condition.RequiredCount,
            targets: condition.Subject?.TargetsLabel || none,
            threshold: formatResponseSeconds(condition.ThresholdSeconds) ?? noTime,
            pick: condition.Subject?.ResourceName || none,
            pickTime: formatResponseSeconds(condition.Subject?.ResponseSeconds) ?? noTime,
          })
        : null;
  const margin = formatMarginSeconds(condition.MarginSeconds);
  const threshold = condition.ConditionType === RunCardConditionType.ArrivesBefore ? formatResponseSeconds(condition.ThresholdSeconds) : null;
  const facts = [t(timeSourceKey(condition.TimeSource)), threshold ? t('run_cards.conditions.threshold', { threshold }) : null, margin ? t('run_cards.conditions.margin', { margin }) : null].filter(
    (part): part is string => !!part
  );

  return (
    <View className="rounded border border-outline-200 p-2" testID={`${testID}-condition-${index}`}>
      <HStack space="sm" className="items-start justify-between">
        <Text className="flex-1 text-sm font-medium">{condition.Label || t('run_cards.conditions.condition_fallback_label')}</Text>
        <HStack space="xs" className="items-center">
          {isConditionUncertain(condition) ? (
            <Badge action="warning" testID={`${testID}-condition-${index}-uncertain`}>
              <BadgeText>{t('run_cards.conditions.uncertain')}</BadgeText>
            </Badge>
          ) : null}
          <Badge action={condition.Result === RunCardConditionResult.Yes ? 'success' : 'muted'} testID={`${testID}-condition-${index}-result`}>
            <BadgeText>{t(conditionResultKey(condition.Result))}</BadgeText>
          </Badge>
        </HStack>
      </HStack>
      {detail ? <Text className="mt-0.5 text-xs text-typography-600">{detail}</Text> : null}
      {facts.length > 0 ? <Text className="text-xs text-typography-500">{facts.join(' · ')}</Text> : null}
      {condition.Note ? <Text className="text-xs italic text-typography-500">{condition.Note}</Text> : null}
    </View>
  );
};

/**
 * How a conditional run card level decided what to ask for: the outcome and its package, advice for the dispatcher,
 * each condition tested on the way, rows that could not be filled as configured (and which the call will keep awaiting),
 * and the first-arriving rows. Read-only explanation; the selection itself is the panel's.
 */
export const RunCardDecisionSection: React.FC<RunCardDecisionSectionProps> = ({ decision, onReevaluate, isReevaluating = false, testID }) => {
  const { t } = useTranslation();
  const sectionTestID = `${testID}-decision`;
  const path = decision.Path ?? [];
  const fallbacks = decision.Fallbacks ?? [];
  const firstArriving = decision.FirstArriving ?? [];
  const advice = decision.AdviceText?.trim();
  const pinnedTime = formatUtcInDepartmentTime(decision.PinnedOn, null, undefined, undefined, t('run_cards.conditions.pinned_unknown_time'));
  const isAdvice = decision.Outcome === RecommendationOutcome.Advice;

  return (
    <VStack space="sm" testID={sectionTestID}>
      <SectionTitle icon={<GitBranch size={14} color={MUTED} />} label={t('run_cards.conditions.decision_section')} />

      {decision.OutcomeLabel ? (
        <Text className="text-sm font-semibold" testID={`${sectionTestID}-outcome`}>
          {t('run_cards.conditions.outcome', { outcome: decision.OutcomeLabel })}
        </Text>
      ) : null}
      {decision.PackageName && !isAdvice ? (
        <Text className="text-xs text-typography-500" testID={`${sectionTestID}-package`}>
          {t('run_cards.conditions.package', { package: decision.PackageName })}
        </Text>
      ) : null}

      {/* Advice is the outcome when the card only advises: it must not read like a footnote. */}
      {advice ? (
        <View className="rounded-lg border-l-4 border-info-500 bg-background-info p-3" testID={`${sectionTestID}-advice`}>
          <HStack space="sm" className="items-start">
            <View>
              <Info size={16} color="#1d4ed8" />
            </View>
            <VStack className="flex-1">
              <Text className="text-xs font-semibold uppercase text-info-700">{t('run_cards.conditions.advice_title')}</Text>
              <Text className="text-sm font-medium text-info-900">{advice}</Text>
            </VStack>
          </HStack>
        </View>
      ) : null}

      {decision.Uncertain ? (
        <HStack space="xs" className="items-start" testID={`${sectionTestID}-uncertain`}>
          <View>
            <AlertTriangle size={14} color={AMBER} />
          </View>
          <Text className="flex-1 text-xs text-warning-600">{t('run_cards.conditions.decision_uncertain')}</Text>
        </HStack>
      ) : null}

      {path.length > 0 ? (
        <VStack space="xs" testID={`${sectionTestID}-path`}>
          {path.map((condition, index) => (
            <ConditionRow key={`rc-cond-${condition.NodeKey ?? index}`} condition={condition} index={index} testID={sectionTestID} />
          ))}
        </VStack>
      ) : null}

      {decision.IdealConfigurationUnavailable || fallbacks.length > 0 ? (
        <View className="rounded-lg border border-warning-300 bg-background-warning p-2" testID={`${sectionTestID}-fallbacks`}>
          <SectionTitle icon={<AlertTriangle size={14} color={AMBER} />} label={t('run_cards.conditions.ideal_unavailable')} className="text-warning-700" />
          {fallbacks.map((fallback, index) => (
            <VStack key={`rc-fallback-${fallback.RequirementScope}-${fallback.RequirementId}-${index}`} className="mt-1" testID={`${sectionTestID}-fallback-${index}`}>
              <Text className="text-xs text-warning-800">
                {t(fallbackStepKey(fallback.Step, !!fallback.SentInstead), {
                  row: fallback.RowLabel || t('run_cards.conditions.row_fallback_label'),
                  sent: fallback.SentInstead ?? '',
                  package: fallback.SubstitutePackageName || t('run_cards.conditions.substitute_package_fallback'),
                  filled: fallback.FilledCount,
                  required: fallback.RequiredCount,
                })}
              </Text>
              {fallback.Outstanding ? (
                <Text className="text-xs font-semibold text-warning-800" testID={`${sectionTestID}-fallback-${index}-outstanding`}>
                  {t('run_cards.conditions.keeps_awaiting')}
                </Text>
              ) : null}
            </VStack>
          ))}
        </View>
      ) : null}

      {firstArriving.length > 0 ? (
        <VStack space="xs" testID={`${sectionTestID}-first-arriving`}>
          <SectionTitle icon={<Zap size={14} color={MUTED} />} label={t('run_cards.conditions.first_arriving_section')} />
          {firstArriving.map((row, index) => (
            <Text key={`rc-first-${index}`} className="text-xs text-typography-600">
              {t('run_cards.conditions.first_arriving_line', {
                row: row.RowLabel || t('run_cards.conditions.row_fallback_label'),
                resource: row.ResourceName || t('run_cards.conditions.none_available'),
                time: formatResponseSeconds(row.ResponseSeconds) ?? t('run_cards.conditions.no_time'),
              })}
              {row.AlreadyIncluded ? ` (${t('run_cards.conditions.first_arriving_included')})` : ''}
            </Text>
          ))}
        </VStack>
      ) : null}

      {decision.Pinned ? (
        <HStack space="sm" className="flex-wrap items-center justify-between" testID={`${sectionTestID}-pinned`}>
          <HStack space="xs" className="flex-1 items-center">
            <View>
              <Pin size={12} color={MUTED} />
            </View>
            <Text className="flex-1 text-xs text-typography-500">{t(pinSourceKey(decision.PinSource), { time: pinnedTime })}</Text>
          </HStack>
          {onReevaluate ? (
            <Button size="xs" variant="outline" action="secondary" onPress={onReevaluate} isDisabled={isReevaluating} testID={`${sectionTestID}-reevaluate`}>
              {isReevaluating ? (
                <ButtonSpinner />
              ) : (
                <View>
                  <RefreshCw size={12} color={MUTED} />
                </View>
              )}
              <ButtonText>{t('run_cards.conditions.reevaluate')}</ButtonText>
            </Button>
          ) : null}
        </HStack>
      ) : null}
    </VStack>
  );
};
