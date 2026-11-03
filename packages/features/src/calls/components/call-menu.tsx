import { useTranslation } from '@resgrid/i18n';
import { CustomBottomSheet, Pressable, Text, useThemeColors } from '@resgrid/ui';
import { CalendarClock, CircleX, FileText, Image as ImageIcon, Paperclip, Pencil, StickyNote, Trash2, UserPlus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export type CallMenuAction = 'edit' | 'dispatch-more' | 'reschedule' | 'close' | 'delete' | 'notes' | 'images' | 'files' | (string & {});

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
  /** Add resources to a call already out (active call, may dispatch). */
  canDispatchMore?: boolean;
  /** Move a scheduled call's dispatch time (still scheduled, may dispatch). */
  canReschedule?: boolean;
  canDelete?: boolean;
  onSelect: (action: CallMenuAction) => void;
  /** Extra entries from other modules (e.g. Unit "set active call"). */
  extraItems?: readonly CallMenuItem[];
}

/**
 * The call detail menu (Dispatch baseline): edit, dispatch more, reschedule, close and delete for users who may, the
 * call's notes, images and files, plus module-supplied entries. Close is left out for a call already closed.
 */
export const CallMenu: React.FC<CallMenuProps> = ({ isOpen, onClose, canEdit, canClose, canDispatchMore = false, canReschedule = false, canDelete = false, onSelect, extraItems = [] }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const items: CallMenuItem[] = [
    ...(canEdit ? [{ id: 'edit' as const, label: t('call_detail.edit_call'), icon: Pencil }] : []),
    ...(canDispatchMore ? [{ id: 'dispatch-more' as const, label: t('call_detail.dispatch_more'), icon: UserPlus }] : []),
    ...(canReschedule ? [{ id: 'reschedule' as const, label: t('call_detail.reschedule'), icon: CalendarClock }] : []),
    { id: 'notes', label: t('call_detail.notes'), icon: StickyNote },
    { id: 'images', label: t('call_detail.images'), icon: ImageIcon },
    { id: 'files', label: t('call_detail.files.button'), icon: Paperclip },
    ...extraItems,
    ...(canClose ? [{ id: 'close' as const, label: t('call_detail.close_call'), icon: CircleX, destructive: true }] : []),
    ...(canDelete ? [{ id: 'delete' as const, label: t('call_detail.delete_call'), icon: Trash2, destructive: true }] : []),
  ];

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[55]} testID="call-menu">
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
                <Icon size={20} color={item.destructive ? colors.error : colors.icon} />
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
