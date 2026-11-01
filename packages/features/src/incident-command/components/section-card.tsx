import { Heading, HStack, Text } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  /** Count shown after the title, e.g. lanes or objectives. */
  count?: number;
  /** Header action (an add button). */
  action?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}

/** A titled board card (IC section cards + Dispatch `Section`). */
export const SectionCard: React.FC<SectionCardProps> = ({ title, icon: Icon, count, action, children, testID }) => (
  <View style={styles.card} className="rounded-xl border border-outline-100 bg-background-0" testID={testID}>
    <HStack className="mb-2 items-center justify-between">
      <HStack className="min-w-0 flex-1 items-center" space="sm">
        {Icon ? (
          <View>
            <Icon size={18} color="#6b7280" />
          </View>
        ) : null}
        <Heading size="sm" accessibilityRole="header">
          {title}
        </Heading>
        {count !== undefined ? <Text className="text-sm text-typography-500">{`(${count})`}</Text> : null}
      </HStack>
      {action ?? null}
    </HStack>
    {children}
  </View>
);

/** An empty-section line. */
export const SectionEmpty: React.FC<{ text: string; testID?: string }> = ({ text, testID }) => (
  <Text className="py-1 text-sm text-typography-500" testID={testID}>
    {text}
  </Text>
);

const styles = StyleSheet.create({
  card: { padding: 12, marginTop: 8 },
});
