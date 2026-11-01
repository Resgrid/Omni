import { FileQuestion, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Box } from '../box';
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
  /** Extra content below the description (e.g. a retry button). */
  children?: React.ReactNode;
  isError?: boolean;
  /** Extra classes for the Center. */
  className?: string;
  /** Root View classes (default "size-full p-6"). */
  viewClassName?: string;
  /** Center classes (default "flex-1 p-6"). */
  centerClassName?: string;
  testID?: string;
}

/** Empty or error state for lists and screens. */
export const ZeroState: React.FC<ZeroStateProps> = ({
  icon: Icon = FileQuestion,
  iconSize = 80,
  iconColor,
  heading,
  description,
  children,
  isError = false,
  className = '',
  viewClassName = 'size-full p-6',
  centerClassName = 'flex-1 p-6',
  testID = 'zero-state',
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const defaultHeading = isError ? t('common.errorOccurred', { defaultValue: 'An error occurred' }) : t('common.noDataAvailable', { defaultValue: 'No data available' });
  const defaultDescription = isError ? t('common.tryAgainLater', { defaultValue: 'Please try again later' }) : t('common.nothingToDisplay', { defaultValue: "There's nothing to display at the moment" });

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

          {children}
        </VStack>
      </Center>
    </View>
  );
};

export default ZeroState;
