import { useTranslation } from '@resgrid/i18n';
import { NativeModal, Pressable, Text } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

export interface CallModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID?: string;
}

/** Page-sheet frame for the call's notes, images and files (R modal UI inside Unit's NativeModal: toasts show above it). */
export const CallModalFrame: React.FC<CallModalFrameProps> = ({ isOpen, onClose, title, children, testID }) => {
  const { t } = useTranslation();
  return (
    <NativeModal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} testID={testID}>
      <View style={styles.screen} className="bg-background-0">
        <View style={styles.header} className="border-outline-100">
          <Text className="flex-1 text-lg font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} className="p-2" testID={testID ? `${testID}-close` : undefined}>
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1 },
});
