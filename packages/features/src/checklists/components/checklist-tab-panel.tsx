import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, RefreshControl, ScrollView, Text, View } from '@resgrid/ui';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface ChecklistTabPanelProps {
  /** Search and filters, kept in place above the scrolling list. */
  header?: React.ReactNode;
  children: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  testID: string;
}

/** One tab of the checklists screen: fixed controls on top, a pull-to-refresh list under them. */
export const ChecklistTabPanel: React.FC<ChecklistTabPanelProps> = ({ header, children, refreshing, onRefresh, testID }) => (
  <View style={styles.fill} testID={testID}>
    {header ? <View style={styles.header}>{header}</View> : null}
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {children}
    </ScrollView>
  </View>
);

export interface ChecklistListFooterProps {
  /** Shown when the list is empty (nothing loaded, or nothing matches). */
  emptyText: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  testID: string;
}

/** The empty line and the "Load more" button under a list. */
export const ChecklistListFooter: React.FC<ChecklistListFooterProps> = ({ emptyText, hasMore, isLoadingMore, onLoadMore, testID }) => {
  const { t } = useTranslation();
  return (
    <>
      {emptyText ? (
        <Text className="py-6 text-center text-typography-500" testID={`${testID}-empty`}>
          {emptyText}
        </Text>
      ) : null}
      {hasMore ? (
        <Button variant="outline" size="sm" className="mt-1 self-center" isDisabled={isLoadingMore} onPress={onLoadMore} testID={`${testID}-more`}>
          {isLoadingMore ? <ButtonSpinner /> : null}
          <ButtonText>{t('checklists.ui.loadMore')}</ButtonText>
        </Button>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },
});
