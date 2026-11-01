import { HStack, Text } from '@resgrid/ui';
import React from 'react';

export interface SummaryRowProps {
  label: string;
  value: number | string;
  fontSize: number;
  /** Colour of the value (department colour or a meaning colour); theme text when omitted. */
  color?: string;
  /** Value size relative to the label. */
  scale?: number;
  testID?: string;
}

/** "Label ........ 12" — one count on a summary widget. */
export const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, fontSize, color, scale = 1.4, testID }) => (
  <HStack className="items-center justify-between py-0.5" space="sm" testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
    <Text className="flex-1 text-typography-600" style={{ fontSize }} numberOfLines={1}>
      {label}
    </Text>
    <Text className={color ? 'font-semibold' : 'font-semibold text-typography-900'} style={color ? { fontSize: fontSize * scale, color } : { fontSize: fontSize * scale }}>
      {String(value)}
    </Text>
  </HStack>
);
