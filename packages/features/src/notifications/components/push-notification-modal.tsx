import { recordPushResponse } from '@resgrid/api';
import { useTranslation } from '@resgrid/i18n';
import { getNotificationsDependencies, navigateToNotificationTarget, type NotificationKind, type NotificationTarget, usePushNotificationModalStore } from '@resgrid/notifications';
import { Button, ButtonText, HStack, Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, Text, useToast, VStack } from '@resgrid/ui';
import { AlertCircle, Bell, Bot, CloudLightning, KeyRound, Mail, MessageCircle, Phone, RadioTower, Wrench } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

type ModalKind = NotificationKind | 'unknown';

const ICONS: Record<ModalKind, React.ComponentType<{ size?: number; color?: string }>> = {
  call: Phone,
  message: Mail,
  notification: Bell,
  chat: MessageCircle,
  chatbot: Bot,
  weatherAlert: CloudLightning,
  workOrder: Wrench,
  signInApproval: KeyRound,
  communicationTest: RadioTower,
  unknown: Bell,
};

const COLORS: Record<ModalKind, string> = {
  call: '#EF4444',
  message: '#3B82F6',
  notification: '#6B7280',
  chat: '#10B981',
  chatbot: '#10B981',
  weatherAlert: '#F59E0B',
  workOrder: '#F97316',
  signInApproval: '#8B5CF6',
  communicationTest: '#0EA5E9',
  unknown: '#6B7280',
};

const TYPE_KEYS: Record<ModalKind, string> = {
  call: 'push_notifications.types.call',
  message: 'push_notifications.types.message',
  notification: 'push_notifications.types.notification',
  chat: 'push_notifications.types.chat',
  chatbot: 'push_notifications.types.chat',
  weatherAlert: 'push_notifications.types.weather',
  workOrder: 'push_notifications.types.work_order',
  signInApproval: 'push_notifications.types.sign_in_approval',
  communicationTest: 'push_notifications.types.communication_test',
  unknown: 'push_notifications.types.notification',
};

const VIEW_KEYS: Partial<Record<NotificationKind, string>> = {
  call: 'push_notifications.view_call',
  message: 'push_notifications.view_message',
  chat: 'push_notifications.view_chat',
  chatbot: 'push_notifications.view_chat',
  weatherAlert: 'push_notifications.view_alert',
  workOrder: 'push_notifications.view_work_order',
  signInApproval: 'push_notifications.view_sign_in',
};

/** Whether this variant has a screen for the target (the variant's deep-link resolver decides; absent routes stay hidden). */
const canRoute = (target: NotificationTarget | null): boolean => {
  if (!target) return false;
  try {
    return !!getNotificationsDependencies().resolveRoute?.(target);
  } catch {
    return false;
  }
};

/**
 * The foreground push modal (Responder baseline), mounted once in the shell and bound to the push modal store: a push
 * that arrives while the app is open — or a tap whose deep link could not land — stays visible here. "View" appears only
 * for a safe target this variant can route to; communication tests get "Confirm receipt". A native window
 * (`useRNModal`) so it shows above open sheets.
 */
export const PushNotificationModal: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const isOpen = usePushNotificationModalStore((state) => state.isOpen);
  const notification = usePushNotificationModalStore((state) => state.notification);
  const hide = usePushNotificationModalStore((state) => state.hideNotificationModal);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsConfirming(false);
  }, [isOpen]);

  if (!notification) return null;
  const kind: ModalKind = notification.kind;
  const Icon = ICONS[kind];
  const target = notification.target;
  const viewKey = target ? VIEW_KEYS[target.kind] : undefined;
  const showView = !!viewKey && canRoute(target);

  const view = () => {
    if (!target) return;
    hide();
    void navigateToNotificationTarget(target);
  };

  const confirmReceipt = async () => {
    if (kind !== 'communicationTest' || !notification.id || isConfirming) return;
    setIsConfirming(true);
    try {
      await recordPushResponse(getNotificationsDependencies().getApiContext(), { ResponseToken: notification.id });
      toast.success(t('push_notifications.communication_test_confirmed'));
      hide();
    } catch {
      // Stay open so the member can retry: dismissing would record them as unreachable by push.
      toast.error(t('push_notifications.communication_test_failed'));
      setIsConfirming(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={hide} size="md" useRNModal testID="push-notification-modal">
      <ModalBackdrop />
      <ModalContent className="mx-4">
        <ModalHeader>
          <HStack space="md" className="items-center">
            <Icon size={24} color={COLORS[kind]} />
            <VStack className="flex-1">
              <Text className="text-lg font-semibold text-typography-900">{t('push_notifications.new_notification')}</Text>
              <Text className="text-sm text-typography-600" testID="push-notification-type">
                {t(TYPE_KEYS[kind])}
              </Text>
            </VStack>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <VStack space="md">
            {notification.title ? (
              <VStack>
                <Text className="text-sm font-medium text-typography-600">{t('push_notifications.title')}</Text>
                <Text className="text-base text-typography-900">{notification.title}</Text>
              </VStack>
            ) : null}
            {notification.body ? (
              <VStack>
                <Text className="text-sm font-medium text-typography-600">{t('push_notifications.message')}</Text>
                <Text className="text-base text-typography-900">{notification.body}</Text>
              </VStack>
            ) : null}
            {kind === 'communicationTest' ? (
              <HStack space="sm" className="items-center rounded-lg bg-info-50 p-3" testID="push-notification-communication-test">
                <AlertCircle size={18} color="#0EA5E9" />
                <Text className="flex-1 text-sm text-info-800">{t('push_notifications.communication_test_prompt')}</Text>
              </HStack>
            ) : null}
            {kind === 'unknown' ? (
              <HStack space="sm" className="items-center rounded-lg bg-warning-50 p-3" testID="push-notification-unknown">
                <AlertCircle size={18} color="#F59E0B" />
                <Text className="flex-1 text-sm text-warning-800">{t('push_notifications.unknown_type_warning')}</Text>
              </HStack>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack space="md" className="w-full">
            <Button variant="outline" className="flex-1" onPress={hide} testID="push-notification-dismiss">
              <ButtonText>{t('common.dismiss')}</ButtonText>
            </Button>
            {showView && viewKey ? (
              <Button className="flex-1" onPress={view} testID="push-notification-view">
                <ButtonText>{t(viewKey)}</ButtonText>
              </Button>
            ) : null}
            {kind === 'communicationTest' && notification.id ? (
              <Button className="flex-1" onPress={() => void confirmReceipt()} isDisabled={isConfirming} testID="push-notification-confirm-receipt">
                <ButtonText>{isConfirming ? t('push_notifications.confirming_receipt') : t('push_notifications.confirm_receipt')}</ButtonText>
              </Button>
            ) : null}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
