import { useActiveVariant, type VariantId } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { CONTRACT_KEYS } from '@resgrid/offline';
import { Box, Button, ButtonText, Heading, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Bell, ClipboardList, LayoutDashboard, type LucideIcon, MapPin, Radio, Shield, Users } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { devicePreferencesKv } from '../lib/device-kv';
import { replaceRoute } from '../lib/navigation';
import { authRoutes } from '../routes';

interface Slide {
  key: string;
  icon: LucideIcon;
}

/** Three slides per variant; text from `onboarding.pages.<variant>.<slide>.title|description` (Responder/Unit content). */
const SLIDES: Record<VariantId, readonly Slide[]> = {
  responder: [
    { key: 'responder.status', icon: Users },
    { key: 'responder.notifications', icon: Bell },
    { key: 'responder.calls', icon: Radio },
  ],
  unit: [
    { key: 'unit.location', icon: MapPin },
    { key: 'unit.notifications', icon: Bell },
    { key: 'unit.calls', icon: Users },
  ],
  ic: [
    { key: 'ic.board', icon: ClipboardList },
    { key: 'ic.awareness', icon: MapPin },
    { key: 'ic.coordinate', icon: Shield },
  ],
  dispatch: [
    { key: 'dispatch.calls', icon: Radio },
    { key: 'dispatch.awareness', icon: MapPin },
    { key: 'dispatch.coordinate', icon: Users },
  ],
  bigboard: [
    { key: 'bigboard.dashboard', icon: LayoutDashboard },
    { key: 'bigboard.glance', icon: Users },
    { key: 'bigboard.pane', icon: MapPin },
  ],
};

/** Whether this installation has finished (or skipped) onboarding: the frozen `IS_FIRST_TIME` flag, a device preference. */
export const isOnboardingComplete = (): boolean => devicePreferencesKv()?.getBoolean(CONTRACT_KEYS.isFirstTime) === false;

export const markOnboardingComplete = (): void => {
  devicePreferencesKv()?.set(CONTRACT_KEYS.isFirstTime, false);
};

export interface OnboardingScreenProps {
  /** Called after Skip or Get started. Default: replace the navigation with the login route. */
  onComplete?: () => void;
}

/** First-run introduction (Responder/Unit `onboarding`, `capabilities.platform.onboarding`): the variant's slides, skip and get started. */
export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const variant = useActiveVariant();
  const slides = SLIDES[variant.id];
  const [index, setIndex] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)];
  const isLast = index >= slides.length - 1;
  const Icon = slide.icon;

  const finish = useCallback(() => {
    markOnboardingComplete();
    if (onComplete) {
      onComplete();
    } else {
      replaceRoute(authRoutes.login());
    }
  }, [onComplete]);

  return (
    <Box className="flex-1 justify-between bg-background-0 p-6" testID="onboarding-screen">
      <HStack className="justify-end">
        {isLast ? null : (
          <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel={t('onboarding.skip')} testID="onboarding-skip" className="p-2">
            <Text className="text-primary-600">{t('onboarding.skip')}</Text>
          </Pressable>
        )}
      </HStack>
      <VStack space="lg" className="w-full max-w-lg items-center self-center">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon size={72} color={colors.primary} />
        </View>
        <Heading size="2xl" className="text-center" accessibilityRole="header" testID="onboarding-title">
          {t(`onboarding.pages.${slide.key}.title`)}
        </Heading>
        <Text className="text-center text-typography-600" testID="onboarding-description">
          {t(`onboarding.pages.${slide.key}.description`)}
        </Text>
      </VStack>
      <VStack space="md" className="w-full max-w-lg self-center">
        <HStack space="sm" className="justify-center" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: slides.length, now: index + 1 }}>
          {slides.map((item, position) => (
            <View key={item.key} className={`h-2 rounded-full ${position === index ? 'w-6 bg-primary-600' : 'w-2 bg-background-300'}`} />
          ))}
        </HStack>
        <Button
          action="primary"
          onPress={isLast ? finish : () => setIndex((current) => Math.min(current + 1, slides.length - 1))}
          accessibilityLabel={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          testID={isLast ? 'onboarding-finish' : 'onboarding-next'}
        >
          <ButtonText>{isLast ? t('onboarding.getStarted') : t('onboarding.next')}</ButtonText>
        </Button>
      </VStack>
    </Box>
  );
}

export default OnboardingScreen;
