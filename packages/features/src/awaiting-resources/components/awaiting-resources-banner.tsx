import { useAwaitingResourcesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { ChevronRight, Hourglass } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useIsAwaitingResourcesEnabled } from '../hooks/use-awaiting-resources';
import { awaitingResourcesRoutes } from '../routes';

export interface AwaitingResourcesBannerProps {
  /** The shell hides it on the Awaiting Resources screen itself. */
  hidden?: boolean;
  /** Overrides navigation (a console opening a side panel instead of the route). */
  onPress?: () => void;
}

const ORANGE = '#ea580c';

/**
 * Persistent strip under the app bar while any call is awaiting resources (conditional run cards): a required resource
 * marked "keep outstanding" has not been sent yet. Stays on every screen until the list is empty — a waiting call is a
 * crew short on scene — and opens the Awaiting Resources screen.
 */
export const AwaitingResourcesBanner: React.FC<AwaitingResourcesBannerProps> = ({ hidden = false, onPress }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isEnabled = useIsAwaitingResourcesEnabled();
  const count = useAwaitingResourcesStore((state) => state.calls.length);

  if (!isEnabled || hidden || count === 0) return null;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(awaitingResourcesRoutes.list() as Href))}
      accessibilityRole="button"
      accessibilityLabel={t('awaiting_resources.banner', { count })}
      accessibilityHint={t('awaiting_resources.banner_open')}
      testID="awaiting-resources-banner"
    >
      <View className="border-b border-warning-300 bg-background-warning px-3 py-1.5">
        <HStack space="sm" className="items-center justify-between">
          <HStack space="sm" className="shrink items-center">
            <View>
              <Hourglass size={14} color={ORANGE} />
            </View>
            <Text size="sm" className="shrink font-semibold text-warning-800" numberOfLines={1}>
              {t('awaiting_resources.banner', { count })}
            </Text>
          </HStack>
          <HStack space="xs" className="items-center">
            <Text size="xs" className="font-medium text-warning-700">
              {t('awaiting_resources.banner_open')}
            </Text>
            <View>
              <ChevronRight size={14} color={ORANGE} />
            </View>
          </HStack>
        </HStack>
      </View>
    </Pressable>
  );
};
