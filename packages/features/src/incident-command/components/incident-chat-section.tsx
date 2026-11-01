import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { MessageCircle, MessagesSquare } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { IconPress } from './board-buttons';
import { SectionCard } from './section-card';

export interface ChatChannelLink {
  key: string;
  label: string;
  hint?: string | null;
  icon: LucideIcon;
  channelId: string | null | undefined;
}

export interface ChatContactLink {
  key: string;
  /** Role or position ("Incident commander", "Safety Officer"). */
  label: string;
  name: string;
  /** Resgrid user; external contacts have none and get no message button. */
  userId?: string | null;
}

export interface IncidentChatSectionProps {
  channels: ChatChannelLink[];
  contacts: ChatContactLink[];
  isFrozen?: boolean;
  onOpenChannel: (channelId: string) => void;
  onMessage: (userId: string) => void;
  testID?: string;
}

/**
 * Incident chat (Responder/Unit `incident-chat-section`, Dispatch board chat): the channels this member may open — only
 * channels the server listed render — and the people on the incident they can reach 1:1. Hidden when there is neither.
 */
export const IncidentChatSection: React.FC<IncidentChatSectionProps> = ({ channels, contacts, isFrozen = false, onOpenChannel, onMessage, testID = 'incident-chat' }) => {
  const { t } = useTranslation();
  const available = channels.filter((channel): channel is ChatChannelLink & { channelId: string } => !!channel.channelId);
  if (available.length === 0 && contacts.length === 0) return null;

  return (
    <SectionCard title={t('incident_command.chat')} icon={MessagesSquare} testID={testID}>
      {isFrozen ? (
        <Text className="mb-2 rounded-md bg-background-100 p-2 text-xs text-typography-600" testID={`${testID}-frozen`}>
          {t('incident_command.chat_frozen')}
        </Text>
      ) : null}
      {available.length > 0 ? (
        <VStack space="xs">
          {available.map((channel) => {
            const Icon = channel.icon;
            return (
              <Pressable
                key={channel.key}
                onPress={() => onOpenChannel(channel.channelId)}
                accessibilityRole="button"
                accessibilityLabel={channel.label}
                className="rounded-lg border border-outline-200 p-3"
                testID={`${testID}-${channel.key}`}
              >
                <HStack className="items-center" space="sm">
                  <View>
                    <Icon size={18} color="#3b82f6" />
                  </View>
                  <VStack className="min-w-0 flex-1">
                    <Text className="font-medium text-typography-900">{channel.label}</Text>
                    {channel.hint ? <Text className="text-xs text-typography-500">{channel.hint}</Text> : null}
                  </VStack>
                </HStack>
              </Pressable>
            );
          })}
        </VStack>
      ) : null}
      {contacts.length > 0 ? (
        <VStack className="mt-3">
          <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('incident_command.ics_positions')}</Text>
          {contacts.map((contact) => (
            <HStack key={contact.key} className="items-center justify-between py-1" testID={`${testID}-contact-${contact.key}`}>
              <VStack className="min-w-0 flex-1">
                <Text className="text-xs text-typography-500">{contact.label}</Text>
                <Text className="font-medium text-typography-900">{contact.name}</Text>
              </VStack>
              {contact.userId ? (
                <IconPress
                  label={t('incident_command.message_person', { name: contact.name })}
                  icon={MessageCircle}
                  color="#3b82f6"
                  onPress={() => onMessage(contact.userId as string)}
                  testID={`${testID}-contact-${contact.key}-message`}
                />
              ) : null}
            </HStack>
          ))}
        </VStack>
      ) : null}
    </SectionCard>
  );
};
