import { navigateToNotificationTarget, usePushNotificationModalStore } from '@resgrid/notifications';
import { NativeModal, Text, useThemeColors } from '@resgrid/ui';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useShellTranslation } from '../i18n';
import { resolveNotificationRoute } from '../routes/notification-routes';

/**
 * The foreground push modal (Responder's behaviour; the store lives in @resgrid/notifications): a push that arrives
 * while the app is open, or a tapped one whose deep link could not land, stays visible here. "View" appears only when
 * this variant has a screen for the target (route contract).
 */
export function PushNotificationModalHost() {
  const isOpen = usePushNotificationModalStore((state) => state.isOpen);
  const notification = usePushNotificationModalStore((state) => state.notification);
  const hide = usePushNotificationModalStore((state) => state.hideNotificationModal);
  const colors = useThemeColors();
  const { t } = useShellTranslation();
  const [opening, setOpening] = useState(false);

  const target = notification?.target ?? null;
  const canView = target ? resolveNotificationRoute(target) !== null : false;

  const onView = useCallback(async () => {
    if (!target) {
      return;
    }
    setOpening(true);
    try {
      hide();
      await navigateToNotificationTarget(target);
    } finally {
      setOpening(false);
    }
  }, [hide, target]);

  if (!isOpen || !notification) {
    return null;
  }

  const title = notification.title || t('shell.push.default_title');

  return (
    <NativeModal visible transparent animationType="fade" onRequestClose={hide} testID="push-notification-modal">
      <View style={StyleSheet.flatten([styles.backdrop, { backgroundColor: colors.backdrop }])}>
        <View accessibilityRole="alert" style={StyleSheet.flatten([styles.card, { backgroundColor: colors.background, borderColor: colors.border }])}>
          <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])} accessibilityRole="header">
            {title}
          </Text>
          {notification.body ? <Text style={StyleSheet.flatten([styles.body, { color: colors.textMuted }])}>{notification.body}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={hide} style={styles.action} testID="push-notification-close">
              <Text style={{ color: colors.textMuted }}>{t('shell.push.close')}</Text>
            </Pressable>
            {canView ? (
              <Pressable
                accessibilityRole="button"
                disabled={opening}
                onPress={onView}
                style={StyleSheet.flatten([styles.action, styles.primaryAction, { backgroundColor: colors.primaryStrong }])}
                testID="push-notification-view"
              >
                <Text style={{ color: colors.textInverse }}>{t('shell.push.view')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginLeft: 8 },
  primaryAction: {},
});
