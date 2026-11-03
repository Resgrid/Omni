import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { HStack, Pressable, Progress, ProgressFilledTrack, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { Award, CalendarClock, ChevronRight } from 'lucide-react-native';
import React from 'react';

import { useExpiryText } from '../hooks/use-expiry-text';
import { certificationName, type ExpiryState, expiryState, expiryTextClass } from '../lib/certification-format';
import { CertificationStatusBadge } from './status-badge';

export interface CertificationCardProps {
  certification: Certification;
  onPress: (id: number) => void;
}

const TILE: Record<ExpiryState, string> = {
  expired: 'bg-background-error',
  soon: 'bg-background-warning',
  ok: 'bg-background-100',
  none: 'bg-background-100',
};

/** One certification in the member's list: name and status, number and issuer, the expiry, and renewal hours. */
export const CertificationCard: React.FC<CertificationCardProps> = React.memo(({ certification: item, onPress }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const expiryText = useExpiryText();
  const state = expiryState(item);
  const name = certificationName(item, t('certifications.untitled'));
  const accent = state === 'expired' ? colors.error : state === 'soon' ? colors.warning : colors.icon;
  const meta = [item.Number ? t('certifications.numberIs', { number: item.Number }) : null, item.IssuedBy].filter(Boolean).join(' · ');
  const required = item.CreditHoursRequired ?? 0;
  const progress = required > 0 ? Math.min(100, Math.round((item.CreditHours / required) * 100)) : 0;

  return (
    <Pressable
      onPress={() => onPress(item.Id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t(`certifications.status.${item.Status}`)}, ${expiryText(item)}`}
      className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4 active:bg-background-50"
      testID={`certification-${item.Id}`}
    >
      <HStack space="md" className="items-start">
        <View className={`size-11 items-center justify-center rounded-full ${TILE[state]}`}>
          <Award size={22} color={accent} />
        </View>
        <VStack space="xs" className="flex-1">
          <HStack space="sm" className="items-start">
            <Text className="flex-1 text-base font-semibold text-typography-900" numberOfLines={2}>
              {name}
            </Text>
            <CertificationStatusBadge status={item.Status} testID={`certification-${item.Id}-status`} />
          </HStack>
          {meta ? (
            <Text size="sm" className="text-typography-600" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <HStack space="xs" className="mt-1 items-center">
            <View>
              <CalendarClock size={14} color={accent} />
            </View>
            <Text size="sm" className={`font-medium ${expiryTextClass(state)}`} testID={`certification-${item.Id}-expiry`}>
              {expiryText(item)}
            </Text>
          </HStack>
          {required > 0 ? (
            <VStack space="xs" className="mt-2">
              <Progress value={progress} size="xs" accessibilityLabel={t('certifications.credits', { hours: item.CreditHours, required })}>
                <ProgressFilledTrack />
              </Progress>
              <Text size="xs" className="text-typography-500">
                {t('certifications.credits', { hours: item.CreditHours, required })}
              </Text>
            </VStack>
          ) : null}
        </VStack>
        <View className="self-center">
          <ChevronRight size={18} color={colors.textSubtle} />
        </View>
      </HStack>
    </Pressable>
  );
});

CertificationCard.displayName = 'CertificationCard';
