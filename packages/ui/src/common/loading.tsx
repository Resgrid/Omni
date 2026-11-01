import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { Box } from '../box';
import { HStack } from '../hstack';
import { Loader2 } from '../lucide-icons';
import { Spinner } from '../spinner';
import { Text } from '../text';
import { useThemeColors } from '../theme/use-theme-colors';
import { useTranslation } from '../utils/i18n';
import { VStack } from '../vstack';

/**
 * Web-only stagger for the pulsing dots. animationDelay is a CSS property react-native-web
 * forwards to the DOM but RN's ViewStyle type (and native) don't support — so it is applied
 * only on web and cast past the native style type.
 */
const dotDelayStyle = (index: number): ViewStyle | undefined => (Platform.OS === 'web' ? ({ animationDelay: `${index * 0.15}s` } as unknown as ViewStyle) : undefined);

export interface LoadingProps {
  /** Text below the indicator. Defaults to the translated "Loading…"; pass an empty string for none. */
  text?: string;
  /** Cover the parent with an overlay. */
  fullscreen?: boolean;
  size?: 'small' | 'large';
  type?: 'spinner' | 'dots' | 'icon';
  /** No backdrop behind the indicator. */
  transparent?: boolean;
  testID?: string;
}

/** Loading indicator (IC baseline): spinner, pulsing dots or a spinning icon, optionally full-screen. */
export const Loading: React.FC<LoadingProps> = ({ text, fullscreen = false, size = 'large', type = 'spinner', transparent = false, testID = 'loading' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const loadingText = text ?? t('common.loading', { defaultValue: 'Loading...' });

  const containerClasses = `items-center justify-center ${fullscreen ? 'absolute inset-0 z-50' : ''} ${transparent ? 'bg-transparent' : 'bg-background-0/80'}`;

  const renderLoadingIndicator = () => {
    switch (type) {
      case 'dots':
        return (
          <HStack space="sm" className="items-center">
            {[1, 2, 3].map((i) => (
              <Box key={i} className={`animate-pulse rounded-full bg-primary-500 ${size === 'small' ? 'size-2' : 'size-3'}`} style={dotDelayStyle(i)} />
            ))}
          </HStack>
        );
      case 'icon':
        // Spin a wrapping View, not the SVG: Reanimated 4's CSS animations can't interpolate `transform` on an <Svg> root.
        return (
          <View className="animate-spin">
            <Loader2 size={size === 'small' ? 24 : 32} color={colors.primary} />
          </View>
        );
      case 'spinner':
      default:
        return <Spinner size={size} color={colors.primary} />;
    }
  };

  return (
    <View className={containerClasses} accessibilityRole="progressbar" accessibilityLabel={loadingText || undefined} accessibilityState={{ busy: true }} testID={testID}>
      <VStack space="sm" className="items-center rounded-xl p-4">
        {renderLoadingIndicator()}
        {loadingText ? <Text className={`mt-2 font-medium text-typography-600 ${size === 'small' ? 'text-xs' : 'text-sm'}`}>{loadingText}</Text> : null}
      </VStack>
    </View>
  );
};

export interface LoadingSkeletonProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  isLoading?: boolean;
  /** Rendered instead of the placeholder once `isLoading` is false. */
  children?: React.ReactNode;
}

const RADIUS_CLASS: Record<NonNullable<LoadingSkeletonProps['borderRadius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-xs',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

/** Placeholder block (IC `Skeleton`; renamed so it does not clash with the gluestack Skeleton primitive). */
export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ width = '100%', height = 20, borderRadius = 'md', isLoading = true, children }) => {
  if (!isLoading) {
    return <>{children}</>;
  }

  return <Box className={`animate-pulse bg-background-200 ${RADIUS_CLASS[borderRadius]}`} style={StyleSheet.flatten([{ width, height }])} testID="loading-skeleton" />;
};

export const ListSkeleton: React.FC<{ count?: number; height?: number; spacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' }> = ({ count = 5, height = 60, spacing = 'sm' }) => (
  <VStack space={spacing} className="w-full">
    {Array.from({ length: count }).map((_, index) => (
      <LoadingSkeleton key={index} height={height} />
    ))}
  </VStack>
);

export const CardSkeleton: React.FC<{ hasImage?: boolean; hasFooter?: boolean }> = ({ hasImage = true, hasFooter = true }) => (
  <Box className="w-full rounded-lg border border-outline-200 bg-background-50 p-4">
    {hasImage ? <LoadingSkeleton height={200} borderRadius="md" /> : null}
    <VStack space="sm" className="mt-4">
      <LoadingSkeleton width="60%" height={24} />
      <LoadingSkeleton height={16} />
      <LoadingSkeleton height={16} />
      <LoadingSkeleton width="80%" height={16} />
    </VStack>
    {hasFooter ? (
      <HStack className="mt-4 justify-between">
        <LoadingSkeleton width={80} height={32} borderRadius="full" />
        <LoadingSkeleton width={80} height={32} borderRadius="full" />
      </HStack>
    ) : null}
  </Box>
);

export const ProfileSkeleton: React.FC = () => (
  <VStack className="w-full items-center p-4">
    <LoadingSkeleton width={100} height={100} borderRadius="full" />
    <VStack space="sm" className="mt-4 w-full items-center">
      <LoadingSkeleton width="50%" height={24} />
      <LoadingSkeleton width="70%" height={16} />
    </VStack>
    <VStack space="md" className="mt-6 w-full">
      <LoadingSkeleton height={50} />
      <LoadingSkeleton height={50} />
      <LoadingSkeleton height={50} />
    </VStack>
  </VStack>
);
