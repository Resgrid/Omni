import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useAiDestinationAdviceStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { AI_DESTINATION_DISMISS_REASON_MAX, type AiDestinationAdviceData, AiDestinationOutcomes } from '@resgrid/models';
import { Box, Button, ButtonText, HStack, Input, InputField, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Sparkles } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAiDestinationAdvice } from '../hooks/use-ai-destination-advice';
import { adviceErrorMessage, type AdviceMessage, adviceOutcomeMessage, adviceRecommendedPoiId, confidencePercent, isLowConfidenceChange, recommendedAvailability } from '../lib/ai-destination-advice';
import { AvailabilityStatusPill } from './destination-parts';

export interface AiDestinationAdviceCardProps {
  callId: number | string;
  /**
   * The app and the member may change this call (the variant's call capability and the member's rights): Ask, Apply and
   * Dismiss show only when the server agrees too (`CanApply`). Off on read-only screens (BigBoard).
   */
  canAct: boolean;
  /** The call's destination is a free location (an address or a point), not a POI. */
  hasFreeDestination?: boolean;
  /** The call form's destination POI now: Apply reads "Selected" once the form already holds the recommendation. */
  selectedPoiId?: number | null;
  /** Apply succeeded: the call form sets its destination field; call detail reads the call again. */
  onApplied?: (poiId: number, name: string | null) => void;
  testID?: string;
}

const MESSAGE_TONE: Readonly<Record<AdviceMessage['tone'], string>> = {
  info: 'text-typography-600',
  success: 'text-success-700',
  warning: 'text-warning-700',
  error: 'text-error-700',
};

/**
 * The call's Enhanced AI destination advice (call-intake-and-ai-destinations-plan.md §7, D4): the destination it recommends
 * (or to keep the current one) with the recommended destination's availability, the capabilities it judged the call needs,
 * its reasoning as plain text, its confidence (a change below the operator's minimum is marked low confidence) and when it
 * was made. A member who may change the call applies it (the call's destination becomes the recommendation), dismisses it
 * with an optional reason, or asks Enhanced AI again. Nothing shows while the department may not use advice, on an older
 * server, or with `Ai.DestinationAdvice` off. The advice never changes the destination by itself.
 */
export const AiDestinationAdviceCard: React.FC<AiDestinationAdviceCardProps> = ({ callId, canAct, hasFreeDestination = false, selectedPoiId = null, onApplied, testID = 'ai-destination-advice' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { isAvailable, canApply, advice, busy } = useAiDestinationAdvice(callId);
  const [message, setMessage] = useState<AdviceMessage | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const adviceId = advice?.Id ?? null;

  // Another advice (a review, a ping) closes a dismiss the member had started on the old one.
  useEffect(() => {
    setIsDismissing(false);
    setReason('');
  }, [adviceId]);

  if (!isAvailable) return null;

  const mayAct = canAct && canApply;
  const recommendedId = adviceRecommendedPoiId(advice);
  const isBusy = busy !== null;

  const ask = async () => {
    setMessage(null);
    const result = await useAiDestinationAdviceStore.getState().requestAdvice(callId);

    setMessage(result.ok ? adviceOutcomeMessage(result.outcome) : adviceErrorMessage(result.error));
  };

  const apply = async (current: AiDestinationAdviceData, poiId: number) => {
    setMessage(null);
    const name = current.RecommendedPoiName;
    const result = await useAiDestinationAdviceStore.getState().applyAdvice(callId, current.Id);

    if (!result.ok) {
      setMessage(adviceErrorMessage(result.error));

      return;
    }

    // Only "Applied" names the destination; every other outcome says why nothing changed.
    setMessage(adviceOutcomeMessage(result.outcome, result.outcome === AiDestinationOutcomes.Applied ? (name ?? `#${poiId}`) : null));

    if (result.outcome === AiDestinationOutcomes.Applied) onApplied?.(poiId, name);
  };

  const dismiss = async (current: AiDestinationAdviceData) => {
    setMessage(null);
    const result = await useAiDestinationAdviceStore.getState().dismissAdvice(callId, current.Id, reason);

    setIsDismissing(false);
    setReason('');
    setMessage(result.ok ? adviceOutcomeMessage(result.outcome) : adviceErrorMessage(result.error));
  };

  return (
    <Box className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3" testID={testID}>
      <HStack space="xs" className="items-center">
        <View>
          <Sparkles size={16} color={colors.primary} />
        </View>
        <Text className="flex-1 text-sm font-semibold text-typography-700" accessibilityRole="header">
          {t('pois.ai_advice.title')}
        </Text>
      </HStack>

      {advice ? (
        <AdviceBody advice={advice} hasFreeDestination={hasFreeDestination} testID={testID} />
      ) : (
        <Text className="mt-1 text-xs text-typography-500" testID={`${testID}-none`}>
          {t('pois.ai_advice.none')}
        </Text>
      )}

      {message ? (
        <Text className={`mt-2 text-xs ${MESSAGE_TONE[message.tone]}`} testID={`${testID}-message`} accessibilityLiveRegion="polite">
          {t(message.key, message.name ? { name: message.name } : undefined)}
        </Text>
      ) : null}

      {busy === 'ask' ? (
        <HStack space="xs" className="mt-2 items-center" testID={`${testID}-asking`} accessibilityLiveRegion="polite">
          <Spinner size="small" />
          <Text className="text-xs text-typography-600">{t('pois.ai_advice.asking')}</Text>
        </HStack>
      ) : null}

      {mayAct && advice && isDismissing ? (
        <VStack space="xs" className="mt-2" testID={`${testID}-dismiss-form`}>
          <Text className="text-xs text-typography-600">{t('pois.ai_advice.dismiss_reason')}</Text>
          <Input variant="outline" size="sm">
            <InputField
              value={reason}
              onChangeText={setReason}
              maxLength={AI_DESTINATION_DISMISS_REASON_MAX}
              placeholder={t('pois.ai_advice.dismiss_reason_placeholder')}
              accessibilityLabel={t('pois.ai_advice.dismiss_reason')}
              testID={`${testID}-dismiss-reason`}
            />
          </Input>
          <HStack space="sm" className="flex-wrap">
            <Button size="sm" action="secondary" variant="outline" onPress={() => setIsDismissing(false)} isDisabled={isBusy} testID={`${testID}-dismiss-cancel`}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button size="sm" action="negative" onPress={() => void dismiss(advice)} isDisabled={isBusy} testID={`${testID}-dismiss-confirm`}>
              {busy === 'dismiss' ? <Spinner size="small" /> : <ButtonText>{t('pois.ai_advice.dismiss')}</ButtonText>}
            </Button>
          </HStack>
        </VStack>
      ) : null}

      {mayAct && !isDismissing ? (
        <HStack space="sm" className="mt-2 flex-wrap items-center">
          {advice && recommendedId !== null ? (
            selectedPoiId !== null && selectedPoiId === recommendedId ? (
              <Text className="text-xs text-typography-500" testID={`${testID}-selected`}>
                {t('pois.suggestions.selected')}
              </Text>
            ) : (
              <Button
                size="sm"
                onPress={() => void apply(advice, recommendedId)}
                isDisabled={isBusy}
                accessibilityLabel={t('pois.ai_advice.apply_label', { name: advice.RecommendedPoiName ?? `#${recommendedId}` })}
                testID={`${testID}-apply`}
              >
                {busy === 'apply' ? <Spinner size="small" /> : <ButtonText>{t('pois.ai_advice.apply')}</ButtonText>}
              </Button>
            )
          ) : null}
          {advice ? (
            <Button size="sm" variant="outline" action="secondary" onPress={() => setIsDismissing(true)} isDisabled={isBusy} testID={`${testID}-dismiss`}>
              <ButtonText>{t('pois.ai_advice.dismiss')}</ButtonText>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onPress={() => void ask()} isDisabled={isBusy} accessibilityState={{ busy: busy === 'ask' }} testID={`${testID}-ask`}>
            <ButtonText>{t('pois.ai_advice.ask')}</ButtonText>
          </Button>
        </HStack>
      ) : null}
    </Box>
  );
};

/** What the advice says: the recommendation, the current destination, what the call needs, why, and how sure. */
const AdviceBody: React.FC<{ advice: AiDestinationAdviceData; hasFreeDestination: boolean; testID: string }> = ({ advice, hasFreeDestination, testID }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const recommendedId = adviceRecommendedPoiId(advice);
  const hasCurrent = advice.CurrentPoiId !== null || hasFreeDestination;

  const headline = recommendedId !== null ? t('pois.ai_advice.consider', { name: advice.RecommendedPoiName ?? `#${recommendedId}` }) : hasCurrent ? t('pois.ai_advice.keep') : t('pois.ai_advice.no_suggestion');

  const current = advice.CurrentPoiName
    ? t('pois.ai_advice.current', { name: advice.CurrentPoiName })
    : advice.CurrentPoiId !== null
      ? t('pois.ai_advice.current', { name: `#${advice.CurrentPoiId}` })
      : hasFreeDestination
        ? t('pois.ai_advice.current_free')
        : t('pois.ai_advice.current_none');

  const needs = (advice.RequiredCapabilities ?? []).map((capability) => capability.Name).filter((name) => !!name?.trim());
  const advisedAt = formatUtcInDepartmentTime(advice.CreatedOn, timeZone);

  const meta = [t('pois.ai_advice.confidence', { percent: confidencePercent(advice.Confidence) }), advisedAt ? t('pois.ai_advice.advised_at', { time: advisedAt }) : null]
    .filter((part): part is string => !!part)
    .join(' · ');

  return (
    <VStack className="mt-1" testID={`${testID}-advice`}>
      <HStack space="xs" className="flex-wrap items-center">
        <Text className="text-sm font-semibold text-typography-900" testID={`${testID}-headline`}>
          {headline}
        </Text>
        {recommendedId !== null ? <AvailabilityStatusPill status={recommendedAvailability(advice)} testID={`${testID}-availability`} /> : null}
      </HStack>
      <Text className="text-xs text-typography-600" testID={`${testID}-current`}>
        {current}
      </Text>
      {needs.length > 0 ? (
        <Text className="text-xs text-typography-600" testID={`${testID}-needs`}>
          {t('pois.suggestions.needs', { names: needs.join(', ') })}
        </Text>
      ) : null}
      {advice.Rationale?.trim() ? (
        // Model text: always plain text, never markup.
        <Text className="mt-1 text-sm text-typography-800" testID={`${testID}-rationale`}>
          {advice.Rationale.trim()}
        </Text>
      ) : null}
      <Text className="mt-1 text-xs text-typography-500" testID={`${testID}-meta`}>
        {meta}
      </Text>
      {isLowConfidenceChange(advice) ? (
        <Text className="mt-1 self-start rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700" testID={`${testID}-low-confidence`}>
          {t('pois.ai_advice.low_confidence')}
        </Text>
      ) : null}
    </VStack>
  );
};
