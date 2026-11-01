import { FlatList, Pressable, Text, View } from '@resgrid/ui';
import React, { type ReactNode, useCallback } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

export interface TableColumn<Row> {
  key: string;
  label: string;
  /** Share of the row width. */
  flex: number;
  render: (row: Row) => ReactNode;
}

export interface WidgetTableProps<Row> {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  fontSize: number;
  emptyMessage: string;
  testID: string;
  /** Overrides the zebra striping (alert highlighting). */
  rowStyle?: (row: Row, index: number) => StyleProp<ViewStyle> | undefined;
  rowTestID?: (row: Row) => string | undefined;
  /** Extra cell after the columns (elapsed timers, marks). */
  trailing?: (row: Row) => ReactNode;
  onRowPress?: (row: Row) => void;
  /** Rows that may be pressed (others render plain). */
  isRowPressable?: (row: Row) => boolean;
  rowAccessibilityLabel?: (row: Row) => string;
}

/**
 * The column table the personnel, units, scheduled-calls (and table-mode calls) widgets draw: a header row from the
 * visible columns in the configured order, zebra rows, one font size, virtualized so a 300-person roster stays smooth.
 */
export function WidgetTable<Row>({ columns, rows, rowKey, fontSize, emptyMessage, testID, rowStyle, rowTestID, trailing, onRowPress, isRowPressable, rowAccessibilityLabel }: WidgetTableProps<Row>) {
  const renderRow = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      const custom = rowStyle?.(item, index);
      const content = (
        <View style={StyleSheet.flatten([styles.row, custom ?? (index % 2 === 0 ? styles.zebra : null)])} testID={rowTestID?.(item)}>
          {columns.map((column) => (
            <View key={column.key} style={StyleSheet.flatten([styles.cell, { flex: column.flex }])}>
              {column.render(item)}
            </View>
          ))}
          {trailing ? trailing(item) : null}
        </View>
      );
      const pressable = !!onRowPress && (isRowPressable ? isRowPressable(item) : true);
      return pressable ? (
        <Pressable onPress={() => onRowPress?.(item)} accessibilityRole="button" accessibilityLabel={rowAccessibilityLabel?.(item)} testID={`${testID}-row-press-${rowKey(item)}`}>
          {content}
        </Pressable>
      ) : (
        content
      );
    },
    [columns, isRowPressable, onRowPress, rowAccessibilityLabel, rowKey, rowStyle, rowTestID, testID, trailing]
  );

  return (
    <View style={styles.fill} testID={testID}>
      <View style={StyleSheet.flatten([styles.row, styles.header])} accessibilityRole="header">
        {columns.map((column) => (
          <View key={column.key} style={StyleSheet.flatten([styles.cell, { flex: column.flex }])}>
            <Text className="font-bold text-typography-700" style={{ fontSize: Math.max(8, fontSize - 2) }} numberOfLines={1}>
              {column.label}
            </Text>
          </View>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={styles.empty} testID={`${testID}-empty`}>
          <Text className="text-center text-sm text-typography-500">{emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.fill}>
          <FlatList data={rows as Row[]} keyExtractor={rowKey} renderItem={renderRow} nestedScrollEnabled />
        </View>
      )}
    </View>
  );
}

export interface CellTextProps {
  children: ReactNode;
  fontSize: number;
  color?: string;
  muted?: boolean;
  bold?: boolean;
}

/** One line of cell text at the widget's font size. */
export const CellText: React.FC<CellTextProps> = ({ children, fontSize, color, muted = false, bold = false }) => (
  <Text
    className={color ? (bold ? 'font-semibold' : undefined) : muted ? 'text-typography-500' : bold ? 'font-semibold text-typography-900' : 'text-typography-800'}
    style={color ? { fontSize, color } : { fontSize }}
    numberOfLines={1}
  >
    {children}
  </Text>
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 2 },
  header: { borderBottomWidth: 1, borderBottomColor: 'rgba(107,114,128,0.35)', paddingBottom: 4 },
  zebra: { backgroundColor: 'rgba(107,114,128,0.08)' },
  cell: { paddingHorizontal: 3, minWidth: 0 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
});
