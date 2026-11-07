import { FileQuestion, type LucideIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Box } from '../box';
import { Button, ButtonSpinner, ButtonText } from '../button';
import { Center } from '../center';
import { Heading } from '../heading';
import { Text } from '../text';
import { useThemeColors } from '../theme/use-theme-colors';
import { useTranslation } from '../utils/i18n';
import { VStack } from '../vstack';

export interface ZeroStateProps {
  /** Lucide icon (default FileQuestion). */
  icon?: LucideIcon;
  iconSize?: number;
  /** Icon colour; defaults to the theme's muted text colour (error colour in an error state). */
  iconColor?: string;
  /** Defaults to the translated "No data available" / "An error occurred". */
  heading?: string;
  /** Defaults to the translated "There's nothing to display" / "Please try again later". */
  description?: string;
  /** Extra content below the description (e.g. an "Add" button): above Refresh in an empty state, below Retry in an error. */
  children?: React.ReactNode;
  isError?: boolean;
  /**
   * Loads what this state stands in for again (a list's refetch, bypassing caches). Shows a Retry button in an error state
   * and a Refresh button in an empty one, with a spinner until the returned promise settles. Every list's empty and error
   * state passes it: the state replaces the list, so pull to refresh is gone with it, and web and Electron have none.
   * It returns the refetch's promise (never `void fetch()`), so the button stays busy and a second press waits for it.
   */
  onRetry?: () => Promise<void>;
  /** Retry button text; defaults to the translated "Retry" (error) / "Refresh" (empty). */
  retryLabel?: string;
  /** Retry button test id; defaults to `${testID}-retry`. */
  retryTestID?: string;
  /** Extra classes for the Center. */
  className?: string;
  /**
   * Root View classes (default "w-full flex-1 p-6": the space its column has left, so under a header, search field or chip
   * row it fills the rest instead of a full screen height that pushes it past the bottom; in a parent that sizes to its
   * content, such as a list's empty slot or a card, it takes its content's height).
   */
  viewClassName?: string;
  /** Center classes (default "flex-1 p-6"). */
  centerClassName?: string;
  testID?: string;
}

/** Runs `onRetry`, reporting whether the promise it returned is still running; a second press while it runs does nothing. */
const useRetry = (onRetry: (() => Promise<void>) | undefined) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const isMounted = useRef(true);
  const isRunning = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const retry = useCallback(() => {
    if (!onRetry || isRunning.current) return;

    isRunning.current = true;
    setIsRetrying(true);

    const settle = () => {
      isRunning.current = false;

      if (isMounted.current) setIsRetrying(false);
    };

    // The screen shows the outcome (the list, or this state again), so a failure, thrown or rejected, needs no handling here.
    new Promise<void>((resolve) => {
      resolve(onRetry());
    }).then(settle, settle);
  }, [onRetry]);

  return { isRetrying, retry };
};

/** Empty or error state for lists and screens. */
export const ZeroState: React.FC<ZeroStateProps> = ({
  icon: Icon = FileQuestion,
  iconSize = 80,
  iconColor,
  heading,
  description,
  children,
  isError = false,
  onRetry,
  retryLabel,
  retryTestID,
  className = '',
  viewClassName = 'w-full flex-1 p-6',
  centerClassName = 'flex-1 p-6',
  testID = 'zero-state',
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { isRetrying, retry } = useRetry(onRetry);

  const defaultHeading = isError ? t('common.errorOccurred', { defaultValue: 'An error occurred' }) : t('common.noDataAvailable', { defaultValue: 'No data available' });
  const defaultDescription = isError ? t('common.tryAgainLater', { defaultValue: 'Please try again later' }) : t('common.nothingToDisplay', { defaultValue: "There's nothing to display at the moment" });
  const retryText = retryLabel ?? (isError ? t('common.retry', { defaultValue: 'Retry' }) : t('common.refresh', { defaultValue: 'Refresh' }));

  const retryButton = onRetry ? (
    <Button
      variant={isError ? 'solid' : 'outline'}
      action={isError ? 'primary' : 'secondary'}
      onPress={retry}
      isDisabled={isRetrying}
      accessibilityLabel={retryText}
      accessibilityState={{ busy: isRetrying, disabled: isRetrying }}
      testID={retryTestID ?? `${testID}-retry`}
    >
      {isRetrying ? <ButtonSpinner /> : null}
      <ButtonText>{retryText}</ButtonText>
    </Button>
  ) : null;

  return (
    <View className={viewClassName}>
      <Center className={`${centerClassName} ${className}`} testID={testID} accessibilityRole={isError ? 'alert' : undefined}>
        <VStack space="md" className="items-center">
          <Box className="mb-4" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon size={iconSize} color={isError ? colors.error : (iconColor ?? colors.textSubtle)} />
          </Box>

          <Heading size="lg" className={`mb-2 text-center ${isError ? 'text-error-500' : 'text-info-500'}`}>
            {heading || defaultHeading}
          </Heading>

          <Text className="mb-6 text-center text-info-400">{description || defaultDescription}</Text>

          {/* An error's first move is to try again; an empty state's is the screen's own action (Add, Compose), then Refresh. */}
          {isError ? retryButton : null}

          {children}

          {isError ? null : retryButton}
        </VStack>
      </Center>
    </View>
  );
};

export default ZeroState;
