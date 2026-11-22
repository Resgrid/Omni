import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import {
  type DispatcherConversationMessageData,
  type DispatcherIntakeMessageData,
  type DispatcherIntakeThreadData,
  DispatcherMessageDirection,
  IntakeMessageAuthor,
  IntakeMessageStatus,
  IntakeThreadHandler,
  IntakeThreadState,
} from '@resgrid/models';
import { Text, VStack } from '@resgrid/ui';
import React from 'react';
import { View } from 'react-native';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

type ThreadEntry = { kind: 'message'; at: string; message: DispatcherIntakeMessageData } | { kind: 'note'; at: string; note: DispatcherConversationMessageData };

/** Who wrote an intake message, as the thread labels it. */
export const intakeAuthorLabel = (message: Pick<DispatcherIntakeMessageData, 'Author' | 'AuthorName'>, participantName: string | null | undefined, t: (key: string) => string): string => {
  switch (message.Author) {
    case IntakeMessageAuthor.Participant:
      return participantName?.trim() || t('dispatcher_desk.intake.author_participant');
    case IntakeMessageAuthor.Assistant:
      return t('dispatcher_desk.intake.author_assistant');
    case IntakeMessageAuthor.Dispatcher:
      return message.AuthorName?.trim() ?? '';
    default:
      return t('dispatcher_desk.intake.author_system');
  }
};

/** Where the thread stands: who is answering the texter, or why nothing more can be sent. */
export const intakeStatusText = (thread: DispatcherIntakeThreadData, t: (key: string, options?: Record<string, string | number>) => string): string => {
  if (thread.OptedOut) return t('dispatcher_desk.intake.opted_out');

  if (thread.State === IntakeThreadState.Closed) return t('dispatcher_desk.intake.closed');

  if (thread.Handler === IntakeThreadHandler.Dispatcher) return t('dispatcher_desk.intake.handler_dispatcher', { name: thread.AssignedUserName ?? '' });

  if (thread.Handler === IntakeThreadHandler.Assistant) return t('dispatcher_desk.intake.handler_assistant');

  return t('dispatcher_desk.intake.handler_unassisted');
};

/**
 * An intake text thread on a desk item (a text to the department's private inbound dispatch number, Core M0325): the texter's messages,
 * Resgrid's welcome and "connected" texts, Enhanced AI's questions and the dispatchers' replies, with the desk's own notes
 * in time order. The texts are call notes read for the viewer; replies go out from the region's master number.
 */
export const IntakeThread: React.FC<{ thread: DispatcherIntakeThreadData; notes: DispatcherConversationMessageData[] }> = ({ thread, notes }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const ended = thread.OptedOut || thread.State === IntakeThreadState.Closed;

  const entries: ThreadEntry[] = [
    ...(thread.Messages ?? []).map((message): ThreadEntry => ({ kind: 'message', at: message.CreatedOn ?? '', message })),
    ...notes.filter((note) => note.Direction === DispatcherMessageDirection.Note).map((note): ThreadEntry => ({ kind: 'note', at: note.CreatedOn ?? '', note })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <VStack space="sm" className="mb-3" testID="desk-intake-thread">
      <View className={`rounded-lg border px-3 py-2 ${ended ? 'border-error-300 bg-error-50' : 'border-outline-200 bg-background-50'}`} accessibilityRole={ended ? 'alert' : undefined}>
        <Text size="sm" className="font-semibold text-typography-900">
          {t('dispatcher_desk.intake.title')}
        </Text>
        <Text size="sm" className={ended ? 'text-error-700' : 'text-typography-700'} testID="desk-intake-status">
          {intakeStatusText(thread, t)}
        </Text>
        {thread.ReplyFromAddress && !ended ? (
          <Text size="xs" className="text-typography-500">
            {t('dispatcher_desk.intake.reply_from', { number: thread.ReplyFromAddress })}
          </Text>
        ) : null}
      </View>

      {entries.length === 0 ? (
        <Text size="sm" className="text-typography-500">
          {t('dispatcher_desk.conversation.empty')}
        </Text>
      ) : null}

      {entries.map((entry) => {
        if (entry.kind === 'note') {
          const note = entry.note;

          return (
            <View
              key={`note-${note.DispatcherConversationMessageId}`}
              className="self-stretch rounded-xl border border-warning-300 bg-background-warning px-3 py-2"
              testID={`desk-message-${note.DispatcherConversationMessageId}`}
            >
              <Text size="xs" className="font-semibold text-warning-800">
                {t('dispatcher_desk.conversation.note_by', { name: note.UserName ?? '' })}
              </Text>
              <Text className="text-typography-900">{note.Body ?? ''}</Text>
            </View>
          );
        }

        const message = entry.message;
        const inbound = message.Direction === DispatcherMessageDirection.Inbound;
        const failed = message.Status === IntakeMessageStatus.Failed;

        const box = inbound
          ? 'self-start border-outline-200 bg-background-50'
          : message.Author === IntakeMessageAuthor.Dispatcher
            ? 'self-end border-primary-200 bg-primary-50'
            : 'self-end border-outline-200 bg-background-100';

        return (
          <View key={message.MessageId} className={`max-w-[85%] rounded-xl border px-3 py-2 ${box}`} testID={`desk-intake-message-${message.MessageId}`}>
            <Text className="text-typography-900">{message.Text ?? ''}</Text>
            <Text size="xs" className={`mt-0.5 ${failed ? 'text-error-700' : 'text-typography-500'}`}>
              {[intakeAuthorLabel(message, thread.ParticipantName, t), message.CreatedOn ? formatUtcInDepartmentTime(message.CreatedOn, timeZone, TIME) : null, failed ? t('dispatcher_desk.intake.failed') : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        );
      })}
    </VStack>
  );
};
