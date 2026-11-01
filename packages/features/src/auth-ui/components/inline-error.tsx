import { Text } from '@resgrid/ui';
import React from 'react';

interface InlineErrorProps {
  message: string | null | undefined;
  testID?: string;
  className?: string;
}

/** An error announced to assistive technology as soon as it appears (live region + alert role). */
export const InlineError: React.FC<InlineErrorProps> = ({ message, testID, className }) =>
  message ? (
    <Text size="sm" className={`text-error-600 ${className ?? ''}`} testID={testID} accessibilityLiveRegion="polite" accessibilityRole="alert" role="alert">
      {message}
    </Text>
  ) : null;
