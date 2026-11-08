import { Heading, HStack, Text } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

/** The cell box a `SectionGrid` gives each `SectionCard` it lays out (null outside a grid). */
const SectionGridCellContext = React.createContext<StyleProp<ViewStyle> | null>(null);

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

/** A titled board card (IC section cards + Dispatch `Section`); inside a `SectionGrid` it takes one grid cell. */
export const SectionCard: React.FC<SectionCardProps> = ({ title, icon: Icon, count, action, children, testID }) => {
  const cell = React.useContext(SectionGridCellContext);

  return (
    <View style={cell ? StyleSheet.flatten([styles.card, cell]) : styles.card} className="rounded-xl border border-outline-100 bg-background-0" testID={testID}>
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
      {cell ? <SectionGridCellContext.Provider value={null}>{children}</SectionGridCellContext.Provider> : children}
    </View>
  );
};

export interface SectionGridProps {
  /** Cards per row: 2 on tablets, laptops and desktops, 1 on phones and narrow panels. */
  columns: 1 | 2;
  children: React.ReactNode;
  testID?: string;
}

/**
 * Lays out the `SectionCard`s inside it `columns` to a row. Cards in a row share the row's height and are as tall as the
 * taller one needs (no card scrolls); a card left alone on the last row spans it, and a section that renders nothing
 * (no voice, no chat) takes no cell.
 */
export const SectionGrid: React.FC<SectionGridProps> = ({ columns, children, testID }) =>
  columns === 2 ? (
    <View style={styles.grid} testID={testID}>
      <SectionGridCellContext.Provider value={styles.cell}>{children}</SectionGridCellContext.Provider>
    </View>
  ) : (
    <View testID={testID}>{children}</View>
  );

/** An empty-section line. */
export const SectionEmpty: React.FC<{ text: string; testID?: string }> = ({ text, testID }) => (
  <Text className="py-1 text-sm text-typography-500" testID={testID}>
    {text}
  </Text>
);

const styles = StyleSheet.create({
  card: { padding: 12, marginTop: 8 },
  // Rows of cells 4pt in from each side; the negative margin keeps the outer cards flush with the board.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  // Two 40% bases fit a row and three do not; growing fills the row, so a card alone on the last row spans it.
  cell: { flexBasis: '40%', flexGrow: 1, flexShrink: 1, minWidth: 0, marginHorizontal: 4 },
});
