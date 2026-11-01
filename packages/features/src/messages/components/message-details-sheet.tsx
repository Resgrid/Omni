import type { MessageResultData } from '@resgrid/models';
import { CustomBottomSheet } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { MessageDetails } from './message-details';

export interface MessageDetailsSheetProps {
  /** The message picked from the list (null = closed). */
  message: MessageResultData | null;
  isOwn?: boolean;
  onClose: () => void;
}

/** A message in a sheet over the list (the full-screen route is MessageDetailScreen). */
export const MessageDetailsSheet: React.FC<MessageDetailsSheetProps> = ({ message, isOwn = false, onClose }) => (
  <CustomBottomSheet isOpen={message !== null} onClose={onClose} snapPoints={[85]} testID="message-details-sheet">
    {message ? (
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <MessageDetails messageId={message.MessageId} fallback={message} isOwn={isOwn} onDeleted={onClose} />
      </ScrollView>
    ) : null}
  </CustomBottomSheet>
);

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  content: { paddingBottom: 40 },
});
