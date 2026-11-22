import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { deskItemKey, isHeldBy, isOfferedTo, isOpenDeskItem, isWaitingInQueue, useDispatcherDeskStore } from '@resgrid/data';
import { callRoutes, useCallDispatchNow } from '@resgrid/features/calls';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { DispatcherMessageDeliveryState, DispatcherMessageDirection, type DispatcherQueueItemData, type DispatcherQueueItemDetailData, DispatcherQueueItemOutcome } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Input, InputField, KeyboardAwareScrollView, Loading, Pressable, Text, Textarea, TextareaInput, useThemeColors, useToast, VStack, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { ArrowRightLeft, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FilePlus2, Link2, Phone, PhoneCall, Send, StickyNote, Undo2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView, useNow } from '../hooks/use-dispatcher-desk';
import {
  deliveryLabelKey,
  eventTypeLabelKey,
  isCallItem,
  isConversationItem,
  isVoiceItem,
  itemPreview,
  itemStateLabelKey,
  itemStateTone,
  itemTitle,
  kindIcon,
  kindLabelKey,
  waitingMs,
  wholeMinutes,
} from '../lib/desk-format';
import { dispatcherDeskRoutes } from '../routes';
import { DeskPill } from './desk-pill';
import { IntakeThread } from './intake-thread';
import { CompleteItemSheet, TransferItemSheet } from './item-sheets';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** The longest reply or note the composer takes (about ten text message segments). */
export const DESK_MESSAGE_MAX_LENGTH = 1600;

interface ActionProps {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'negative' | 'positive';
  isBusy?: boolean;
  isDisabled?: boolean;
  testID: string;
}

/** A large item action (touch-sized on phones and tablets). */
const ItemAction: React.FC<ActionProps> = ({ label, icon: Icon, onPress, tone = 'secondary', isBusy = false, isDisabled = false, testID }) => {
  const colors = useThemeColors();
  const solid = tone !== 'secondary';

  return (
    <Button
      size="md"
      action={tone}
      variant={solid ? 'solid' : 'outline'}
      onPress={(event?: GestureResponderEvent) => {
        event?.stopPropagation?.();
        onPress();
      }}
      isDisabled={isBusy || isDisabled}
      accessibilityLabel={label}
      className="mb-2 mr-2 min-h-[44px]"
      testID={testID}
    >
      {isBusy ? (
        <ButtonSpinner />
      ) : (
        <View>
          <Icon size={16} color={solid ? colors.textInverse : colors.icon} />
        </View>
      )}
      <ButtonText>{label}</ButtonText>
    </Button>
  );
};

/** A pending or scheduled call: what it is, open it, send it with the dispatch picker. */
const CallPanel: React.FC<{ item: DispatcherQueueItemData; canWork: boolean; onDispatched: () => void }> = ({ item, canWork, onDispatched }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const timeZone = useDepartmentTimeZone();
  const dispatchNow = useCallDispatchNow({ onDispatched });
  const callId = item.CallId ? String(item.CallId) : null;

  return (
    <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3" testID="desk-item-call">
      <HStack space="sm" className="items-center">
        {item.CallPriorityColor ? <View className="h-3 w-3 rounded-full" style={{ backgroundColor: item.CallPriorityColor }} /> : null}
        <Text className="shrink font-semibold text-typography-900" numberOfLines={2}>
          {[item.CallNumber, item.CallName].filter(Boolean).join(' · ') || t(kindLabelKey(item.Kind))}
        </Text>
      </HStack>
      {itemPreview(item) ? <Text className="mt-1 text-typography-700">{itemPreview(item)}</Text> : null}
      {item.TargetAddress ? (
        <Text size="sm" className="mt-1 text-typography-600">
          {item.TargetAddress}
        </Text>
      ) : null}
      {item.DueOn ? (
        <Text size="sm" className="mt-1 text-typography-600">
          {t('dispatcher_desk.item.due_on', { time: formatUtcInDepartmentTime(item.DueOn, timeZone) })}
        </Text>
      ) : null}
      <HStack className="mt-3 flex-wrap">
        {callId ? <ItemAction label={t('dispatcher_desk.item.open_call')} icon={ExternalLink} onPress={() => pushRoutePath(router, callRoutes.callDetail(callId))} testID="desk-item-open-call" /> : null}
        {callId && canWork ? (
          <ItemAction
            label={t('dispatcher_desk.item.dispatch_now')}
            icon={Send}
            tone="primary"
            isBusy={dispatchNow.busyCallId === callId}
            onPress={() => void dispatchNow.openDispatchPicker(callId)}
            testID="desk-item-dispatch-now"
          />
        ) : null}
      </HStack>
      {dispatchNow.dialogs}
    </View>
  );
};

/** A text, email or chat conversation: inbound, outbound (with delivery) and notes, oldest first. */
const ConversationThread: React.FC<{ detail: DispatcherQueueItemDetailData | null }> = ({ detail }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const messages = detail?.Messages ?? [];

  // A text to the department's private inbound dispatch number: the thread lives in intake (its texts are call notes); desk notes join it.
  if (detail?.IntakeConversation) return <IntakeThread thread={detail.IntakeConversation} notes={messages} />;

  if (messages.length === 0) {
    return (
      <Text size="sm" className="mb-3 text-typography-500" testID="desk-thread-empty">
        {t('dispatcher_desk.conversation.empty')}
      </Text>
    );
  }

  return (
    <VStack space="sm" className="mb-3" testID="desk-thread">
      {messages.map((message) => {
        const inbound = message.Direction === DispatcherMessageDirection.Inbound;
        const note = message.Direction === DispatcherMessageDirection.Note;
        const failed = message.DeliveryState === DispatcherMessageDeliveryState.Failed;
        const box = note ? 'self-stretch border-warning-300 bg-background-warning' : inbound ? 'self-start border-outline-200 bg-background-50' : 'self-end border-primary-200 bg-primary-50';

        return (
          <View key={message.DispatcherConversationMessageId} className={`max-w-[85%] rounded-xl border px-3 py-2 ${box}`} testID={`desk-message-${message.DispatcherConversationMessageId}`}>
            {note ? (
              <Text size="xs" className="font-semibold text-warning-800">
                {t('dispatcher_desk.conversation.note_by', { name: message.UserName ?? '' })}
              </Text>
            ) : null}
            <Text className="text-typography-900">{message.Body ?? ''}</Text>
            <Text size="xs" className={`mt-0.5 ${failed ? 'text-error-700' : 'text-typography-500'}`}>
              {[
                inbound ? message.FromAddress : note ? null : (message.UserName ?? null),
                message.CreatedOn ? formatUtcInDepartmentTime(message.CreatedOn, timeZone, TIME) : null,
                inbound || note ? null : t(deliveryLabelKey(message.DeliveryState)),
                failed && message.Error ? message.Error : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        );
      })}
    </VStack>
  );
};

/** The reply / note box under a held conversation. */
const Composer: React.FC<{ item: DispatcherQueueItemData; canReply: boolean }> = ({ item, canReply }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(deskItemKey(item.DispatcherQueueItemId)));
  const [mode, setMode] = useState<'reply' | 'note'>(canReply ? 'reply' : 'note');
  const [body, setBody] = useState('');
  const asNote = mode === 'note' || !canReply;

  const submit = async () => {
    const draft = body;
    const text = draft.trim();

    if (!text) return;
    const store = useDispatcherDeskStore.getState();
    const outcome = await actions.run(() => (asNote ? store.addNote(item.DispatcherQueueItemId, text) : store.sendMessage(item.DispatcherQueueItemId, text)));

    // An intake thread's reply is a call note read back through intake: the answer carries no message, so read the item. A text
    // the carrier refused is on the thread too ("Not delivered"), so read it either way; the draft stays for another try.
    if (!asNote && item.IntakeConversationId) void store.fetchItem(item.DispatcherQueueItemId, { bypassCache: true });

    if (!outcome.ok) return;
    // Only what was sent is cleared: a new draft typed while it was sending stays.
    setBody((current) => (current === draft ? '' : current));
  };

  return (
    <View className="border-t border-outline-200 bg-background-0 px-3 py-2" testID="desk-composer">
      <HStack space="sm" className="mb-1.5">
        {canReply ? (
          <Pressable
            onPress={() => setMode('reply')}
            accessibilityRole="radio"
            accessibilityState={{ selected: !asNote }}
            className={`rounded-full px-3 py-1 ${!asNote ? 'bg-primary-500' : 'bg-background-100'}`}
            testID="desk-composer-reply"
          >
            <Text size="xs" className={!asNote ? 'font-semibold text-typography-0' : 'text-typography-700'}>
              {t('dispatcher_desk.conversation.reply')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setMode('note')}
          accessibilityRole="radio"
          accessibilityState={{ selected: asNote }}
          className={`rounded-full px-3 py-1 ${asNote ? 'bg-warning-500' : 'bg-background-100'}`}
          testID="desk-composer-note"
        >
          <Text size="xs" className={asNote ? 'font-semibold text-typography-0' : 'text-typography-700'}>
            {t('dispatcher_desk.conversation.add_note')}
          </Text>
        </Pressable>
      </HStack>
      <HStack space="sm" className="items-end">
        <Textarea size="md" className="flex-1">
          <TextareaInput
            value={body}
            onChangeText={setBody}
            placeholder={t(asNote ? 'dispatcher_desk.conversation.note_placeholder' : 'dispatcher_desk.conversation.reply_placeholder')}
            accessibilityLabel={t(asNote ? 'dispatcher_desk.conversation.add_note' : 'dispatcher_desk.conversation.reply')}
            maxLength={DESK_MESSAGE_MAX_LENGTH}
            testID="desk-composer-input"
          />
        </Textarea>
        <Button
          size="lg"
          onPress={() => void submit()}
          isDisabled={busy || !body.trim()}
          accessibilityLabel={t(asNote ? 'dispatcher_desk.conversation.save_note' : 'dispatcher_desk.conversation.send')}
          className="min-h-[48px]"
          testID="desk-composer-send"
        >
          {busy ? <ButtonSpinner /> : <View>{asNote ? <StickyNote size={18} color={colors.textInverse} /> : <Send size={18} color={colors.textInverse} />}</View>}
        </Button>
      </HStack>
    </View>
  );
};

/** A held phone call: answer it (the desk rings the dispatcher's phone), or call an abandoned caller back. */
const VoicePanel: React.FC<{ item: DispatcherQueueItemData; detail: DispatcherQueueItemDetailData | null; canWork: boolean }> = ({ item, detail, canWork }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { me } = useDispatcherDeskView();
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(deskItemKey(item.DispatcherQueueItemId)));
  const [number, setNumber] = useState(me?.CallbackNumber ?? '');
  const canConnect = detail?.CanConnectVoice !== false;

  const answer = async () => {
    const store = useDispatcherDeskStore.getState();
    const outcome = await actions.run(() => (item.CallerWaiting ? store.connectVoice(item.DispatcherQueueItemId, number) : store.callBack(item.DispatcherQueueItemId, number)));

    if (outcome.ok) toast.info(t('dispatcher_desk.voice.ringing'), t(item.CallerWaiting ? 'dispatcher_desk.voice.answer' : 'dispatcher_desk.voice.call_back'), { duration: 8000 });
  };

  return (
    <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3" testID="desk-item-voice">
      <Text size="sm" className="text-typography-600">
        {t('dispatcher_desk.voice.caller')}
      </Text>
      <Text className="text-lg font-semibold text-typography-900" testID="desk-voice-caller">
        {item.SourceName ? `${item.SourceName} · ` : ''}
        {item.SourceAddress ?? t('dispatcher_desk.voice.unknown_caller')}
      </Text>
      <DeskPill label={t(item.CallerWaiting ? 'dispatcher_desk.voice.caller_waiting' : 'dispatcher_desk.voice.caller_gone')} tone={item.CallerWaiting ? 'error' : 'muted'} testID="desk-voice-state" />
      {canWork && canConnect ? (
        <View className="mt-3">
          <Text size="sm" className="mb-1 font-medium text-typography-700">
            {t('dispatcher_desk.voice.ring_number')}
          </Text>
          <Input size="lg">
            <InputField value={number} onChangeText={setNumber} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel={t('dispatcher_desk.voice.ring_number')} testID="desk-voice-number" />
          </Input>
          <Text size="xs" className="mb-2 mt-1 text-typography-500">
            {t('dispatcher_desk.voice.ring_hint')}
          </Text>
          <ItemAction
            label={t(item.CallerWaiting ? 'dispatcher_desk.voice.answer' : 'dispatcher_desk.voice.call_back')}
            icon={item.CallerWaiting ? PhoneCall : Phone}
            tone="positive"
            isBusy={busy}
            onPress={() => void answer()}
            testID={item.CallerWaiting ? 'desk-voice-answer' : 'desk-voice-call-back'}
          />
        </View>
      ) : null}
      {canWork && !canConnect ? (
        <Text size="sm" className="mt-2 text-typography-600">
          {t('dispatcher_desk.voice.unavailable')}
        </Text>
      ) : null}
    </View>
  );
};

/** What happened to the item, newest last; folded away until asked for. */
const ItemHistory: React.FC<{ detail: DispatcherQueueItemDetailData | null }> = ({ detail }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const [open, setOpen] = useState(false);
  const events = detail?.Events ?? [];

  if (events.length === 0) return null;

  return (
    <View className="mb-3" testID="desk-item-history">
      <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-[40px] flex-row items-center" testID="desk-item-history-toggle">
        <View className="mr-1">{open ? <ChevronDown size={16} color={colors.icon} /> : <ChevronRight size={16} color={colors.icon} />}</View>
        <Text className="font-semibold text-typography-800">{t('dispatcher_desk.item.history', { count: events.length })}</Text>
      </Pressable>
      {open ? (
        <VStack space="xs" className="ml-5">
          {events.map((event, index) => (
            <Text key={`${event.EventType}-${event.OccurredOn ?? index}`} size="sm" className="text-typography-700">
              {[event.OccurredOn ? formatUtcInDepartmentTime(event.OccurredOn, timeZone, TIME) : null, t(eventTypeLabelKey(event.EventType)), event.UserName, event.Detail].filter(Boolean).join(' · ')}
            </Text>
          ))}
        </VStack>
      ) : null}
    </View>
  );
};

export interface DeskItemDetailProps {
  itemId: string;
  /** After the item is finished, released or handed over (a phone goes back to the queue). */
  onLeave?: () => void;
  testID?: string;
}

/**
 * One piece of desk work, by kind: a pending or scheduled call (open it, dispatch it now), a conversation (the thread,
 * reply or add a note, create a call from it), a held phone call (answer it, call back). Whoever may act on it gets the
 * actions for its state: accept or decline an offer, take waiting work, release, transfer or complete held work.
 */
export const DeskItemDetail: React.FC<DeskItemDetailProps> = ({ itemId, onLeave, testID = 'desk-item-detail' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const { me, queue, isSignedIn } = useDispatcherDeskView();
  const detail = useDispatcherDeskStore((state) => state.items[itemId] ?? null);
  const recent = useDispatcherDeskStore((state) => state.recent);
  const loading = useDispatcherDeskStore((state) => state.loading.item === true);
  const error = useDispatcherDeskStore((state) => state.errors.item ?? null);
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(deskItemKey(itemId)));
  const pendingCallId = useDispatcherDeskStore((state) => state.pendingCallLinks[itemId] ?? null);
  const actions = useDeskActions();
  const now = useNow(30000);
  const [sheet, setSheet] = useState<'transfer' | 'complete' | null>(null);
  const item = queue.find((entry) => entry.DispatcherQueueItemId === itemId) ?? detail?.Item ?? recent.find((entry) => entry.DispatcherQueueItemId === itemId) ?? null;
  const userId = me?.UserId ?? null;

  useEffect(() => {
    void useDispatcherDeskStore.getState().fetchItem(itemId, { bypassCache: true });
  }, [itemId]);

  if (!item) {
    if (loading) return <Loading text={t('dispatcher_desk.item.loading')} />;

    return (
      <ZeroState
        // A failed read (timeout, offline) is not "gone from the desk": only a read that came back without the item says so.
        heading={error ? t('common.errorOccurred') : t('dispatcher_desk.item.not_found')}
        description={error ? t(error.messageKey) : undefined}
        isError={!!error}
        onRetry={() => useDispatcherDeskStore.getState().fetchItem(itemId, { bypassCache: true })}
        testID={`${testID}-missing`}
      />
    );
  }

  const Icon = kindIcon(item.Kind);
  const offered = isOfferedTo(item, userId);
  const held = isHeldBy(item, userId);
  const waiting = isWaitingInQueue(item);
  const canSupervise = me?.CanSupervise === true;
  const store = () => useDispatcherDeskStore.getState();
  const leaveAfter = (run: Promise<{ ok: boolean }>) => void run.then((outcome) => (outcome.ok ? onLeave?.() : undefined));

  // Returning an intake thread to the queue hands the texter back (no dispatcher connected); the action's answer carries the
  // desk item only, so read the thread again for the screens that stay on the item.
  const rereadThread = <T extends { ok: boolean }>(outcome: T): T => {
    if (outcome.ok && item.IntakeConversationId) void store().fetchItem(itemId, { bypassCache: true });

    return outcome;
  };

  return (
    <View className="flex-1" testID={testID}>
      <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View className="mb-3">
          <HStack space="sm" className="items-center">
            <View>
              <Icon size={20} color={colors.icon} />
            </View>
            <Text className="shrink text-lg font-bold text-typography-900" numberOfLines={2} testID={`${testID}-title`}>
              {itemTitle(item) || t(kindLabelKey(item.Kind))}
            </Text>
          </HStack>
          <HStack space="xs" className="mt-1 flex-wrap items-center">
            <DeskPill label={t(kindLabelKey(item.Kind))} tone="muted" />
            <DeskPill label={t(itemStateLabelKey(item.State))} tone={itemStateTone(item.State)} testID={`${testID}-state`} />
            {item.AssignedUserName && !held ? (
              <Text size="xs" className="text-typography-500">
                {t('dispatcher_desk.queue.held_by', { name: item.AssignedUserName })}
              </Text>
            ) : null}
            <Text size="xs" className="text-typography-500">
              {t('dispatcher_desk.queue.waited', { minutes: wholeMinutes(waitingMs(item, now)) })}
            </Text>
          </HStack>
          {item.Subject && isConversationItem(item) ? (
            <Text size="sm" className="mt-1 text-typography-700">
              {item.Subject}
            </Text>
          ) : null}
          {item.OverflowNote ? (
            <Text size="sm" className="mt-1 text-error-700">
              {item.OverflowNote}
            </Text>
          ) : null}
        </View>

        <HStack className="flex-wrap" testID={`${testID}-actions`}>
          {offered ? (
            <>
              <ItemAction label={t('dispatcher_desk.offer.accept')} icon={CheckCircle2} tone="primary" isBusy={busy} onPress={() => void actions.run(() => store().accept(itemId))} testID="desk-item-accept" />
              <ItemAction label={t('dispatcher_desk.offer.decline')} icon={Undo2} isBusy={busy} onPress={() => leaveAfter(actions.run(() => store().decline(itemId)))} testID="desk-item-decline" />
            </>
          ) : null}
          {waiting && isSignedIn ? (
            <ItemAction label={t('dispatcher_desk.queue.take')} icon={CheckCircle2} tone="primary" isBusy={busy} onPress={() => void actions.run(() => store().accept(itemId))} testID="desk-item-take" />
          ) : null}
          {/* A call created here that the desk did not link is linked again, never created a second time. */}
          {held && isConversationItem(item) && !item.CallId ? (
            pendingCallId !== null ? (
              <ItemAction
                label={t('dispatcher_desk.item.link_saved_call')}
                icon={Link2}
                tone="primary"
                isBusy={busy}
                onPress={() => void actions.run(() => store().linkCall(itemId, pendingCallId), { success: t('dispatcher_desk.create_call.linked') })}
                testID="desk-item-link-call"
              />
            ) : (
              <ItemAction label={t('dispatcher_desk.item.create_call')} icon={FilePlus2} onPress={() => pushRoutePath(router, dispatcherDeskRoutes.itemCall(itemId))} testID="desk-item-create-call" />
            )
          ) : null}
          {held && isConversationItem(item) && item.CallId ? (
            <ItemAction label={t('dispatcher_desk.item.open_call')} icon={ExternalLink} onPress={() => pushRoutePath(router, callRoutes.callDetail(String(item.CallId)))} testID="desk-item-linked-call" />
          ) : null}
          {held ? <ItemAction label={t('dispatcher_desk.item.complete')} icon={CheckCircle2} tone="positive" isBusy={busy} onPress={() => setSheet('complete')} testID="desk-item-complete" /> : null}
          {held ? (
            <ItemAction
              label={t('dispatcher_desk.item.release')}
              icon={Undo2}
              isBusy={busy}
              onPress={() => leaveAfter(actions.run(() => store().release(itemId), { success: t('dispatcher_desk.item.released') }).then(rereadThread))}
              testID="desk-item-release"
            />
          ) : null}
          {/* A supervisor hands over someone else's open work; completed or abandoned work keeps its last holder but has nothing to hand over. */}
          {held || (canSupervise && isOpenDeskItem(item) && !waiting && !offered && item.AssignedUserId) ? (
            <ItemAction label={t('dispatcher_desk.item.transfer')} icon={ArrowRightLeft} isBusy={busy} onPress={() => setSheet('transfer')} testID="desk-item-transfer" />
          ) : null}
        </HStack>

        {isCallItem(item) ? (
          <CallPanel
            item={item}
            canWork={held}
            onDispatched={() =>
              void actions
                .run(() => store().complete({ ItemId: itemId, Outcome: DispatcherQueueItemOutcome.Dispatched, CallId: item.CallId }), { success: t('dispatcher_desk.complete.done') })
                .then((outcome) => (outcome.ok ? onLeave?.() : undefined))
            }
          />
        ) : null}
        {isVoiceItem(item) ? <VoicePanel item={item} detail={detail} canWork={held} /> : null}
        {isConversationItem(item) ? <ConversationThread detail={detail} /> : null}
        <ItemHistory detail={detail} />
      </KeyboardAwareScrollView>

      {isConversationItem(item) && held ? <Composer item={item} canReply={detail?.CanReply !== false} /> : null}

      <TransferItemSheet item={item} isOpen={sheet === 'transfer'} onClose={() => setSheet(null)} onDone={onLeave} />
      <CompleteItemSheet item={item} isOpen={sheet === 'complete'} onClose={() => setSheet(null)} onDone={onLeave} />
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 16 },
});
