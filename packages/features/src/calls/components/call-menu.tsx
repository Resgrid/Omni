import { useTranslation } from '@resgrid/i18n';
import { CustomBottomSheet, Pressable, Text } from '@resgrid/ui';
import { CircleX, FileText, Image as ImageIcon, Paperclip, Pencil, StickyNote } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export type CallMenuAction = 'edit' | 'close' | 'notes' | 'images' | 'files' | (string & {});

export interface CallMenuItem {
  id: CallMenuAction;
  label: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  destructive?: boolean;
}

export interface CallMenuProps {
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
  canClose: boolean;
  onSelect: (action: CallMenuAction) => void;
  /** Extra entries from other modules (e.g. Dispatch "escalate", Unit "set active call"). */
  extraItems?: readonly CallMenuItem[];
}

/** The call detail menu (R + D): edit, close, notes, images, files, plus module-supplied entries. */
export const CallMenu: React.FC<CallMenuProps> = ({ isOpen, onClose, canEdit, canClose, onSelect, extraItems = [] }) => {
  const { t } = useTranslation();
  const items: CallMenuItem[] = [
    ...(canEdit ? [{ id: 'edit' as const, label: t('call_detail.edit_call'), icon: Pencil }] : []),
    { id: 'notes', label: t('call_detail.notes'), icon: StickyNote },
    { id: 'images', label: t('call_detail.images'), icon: ImageIcon },
    { id: 'files', label: t('call_detail.files.button'), icon: Paperclip },
    ...extraItems,
    ...(canClose ? [{ id: 'close' as const, label: t('call_detail.close_call'), icon: CircleX, destructive: true }] : []),
  ];
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[45]} testID="call-menu">
      <View style={styles.list} accessibilityRole="menu">
        {items.map((item) => {
          const Icon = item.icon ?? FileText;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                onClose();
                onSelect(item.id);
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              testID={`call-menu-${item.id}`}
              className="flex-row items-center rounded-lg px-3 py-3"
            >
              <View style={styles.icon}>
                <Icon size={20} color={item.destructive ? '#DC2626' : '#374151'} />
              </View>
              <Text className={item.destructive ? 'font-medium text-error-600' : 'font-medium text-typography-900'}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  list: { width: '100%' },
  icon: { marginRight: 12 },
});
