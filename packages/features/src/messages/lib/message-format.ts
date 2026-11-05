import { isRedactedValue } from '@resgrid/auth';
import { formatDateForDisplay, formatUtcInDepartmentTime, parseDateISOString, parseUtcMs } from '@resgrid/core/utils/dates';
import type { RecipientPickerEntry, RecipientPickerSection, RecipientPickerSelection } from '@resgrid/features/calls';
import type { MessageRecipientInput, MessageResultData, RecipientsResultData } from '@resgrid/models';

/**
 * Core `MessageTypes`. The legacy apps labelled 1 as "Poll" and 2 as "Alert"; Core has 1 = Callback, 2 = Poll,
 * 3 = WeatherAlert (system-sent), 4 = CalendarRsvp.
 */
export const MessageType = { Normal: 0, Callback: 1, Poll: 2, WeatherAlert: 3, CalendarRsvp: 4 } as const;

/** Core `RespondToMessageInput.Type`: 1 = Yes, 2 = Maybe, 3 = No (calendar RSVPs take 1 = attending, 3 = not attending). */
export const MessageResponseType = { Yes: 1, Maybe: 2, No: 3 } as const;

/** The types a member may send from the app (weather alerts and RSVPs are system-generated). */
export const COMPOSABLE_MESSAGE_TYPES = [MessageType.Normal, MessageType.Callback, MessageType.Poll] as const;

export type MessageFilter = 'all' | 'inbox' | 'sent';

export type BadgeAction = 'success' | 'warning' | 'error' | 'info' | 'muted';

export const getMessageTypeKey = (type: number): string => {
  switch (type) {
    case MessageType.Callback:
      return 'messages.types.callback';
    case MessageType.Poll:
      return 'messages.types.poll';
    case MessageType.WeatherAlert:
      return 'messages.types.weather_alert';
    case MessageType.CalendarRsvp:
      return 'messages.types.calendar_rsvp';
    default:
      return 'messages.types.message';
  }
};

export const getMessageTypeAction = (type: number): BadgeAction => {
  switch (type) {
    case MessageType.Callback:
      return 'warning';
    case MessageType.Poll:
      return 'success';
    case MessageType.WeatherAlert:
      return 'error';
    case MessageType.CalendarRsvp:
      return 'info';
    default:
      return 'muted';
  }
};

/** A recipient's answer as stored by Core ("1"/"2"/"3", or "Yes"/"No" for calendar RSVPs) → translation key; null = show raw. */
export const getResponseKey = (response: string | null | undefined): string | null => {
  switch ((response ?? '').trim().toLowerCase()) {
    case '1':
    case 'yes':
      return 'messages.response_yes';
    case '2':
    case 'maybe':
      return 'messages.response_maybe';
    case '3':
    case 'no':
      return 'messages.response_no';
    default:
      return null;
  }
};

/** `ExpiredOn` is a UTC instant that often arrives without "Z": parsed as UTC, never device-local (legacy bug). */
export const isMessageExpired = (expiredOn: string | null | undefined, now: number = Date.now()): boolean => {
  const at = parseUtcMs(expiredOn);

  return at !== null && at < now;
};

/** When it was sent: the UTC instant in the department's zone, else the department-local `SentOn` as given. */
export const formatSentOn = (message: Pick<MessageResultData, 'SentOn' | 'SentOnUtc'>, zoneId: string | null, locale?: string): string => {
  if (message.SentOnUtc) return formatUtcInDepartmentTime(message.SentOnUtc, zoneId, { dateStyle: 'medium', timeStyle: 'short' }, locale);
  const local = parseDateISOString(message.SentOn);

  return local ? formatDateForDisplay(local, 'MMM dd, yyyy h:mm tt', locale) : '';
};

export const formatUtc = (value: string | null | undefined, zoneId: string | null, locale?: string): string => formatUtcInDepartmentTime(value, zoneId, { dateStyle: 'medium', timeStyle: 'short' }, locale);

/** The caller may answer: a callback or poll they received, not answered yet, not expired. RSVPs have their own buttons. */
export const canRespondToMessage = (message: MessageResultData, isOwn: boolean, now: number = Date.now()): boolean =>
  !isOwn && !message.Responded && !isMessageExpired(message.ExpiredOn, now) && (message.Type === MessageType.Callback || message.Type === MessageType.Poll);

/** A calendar invitation the caller can still answer from the message. */
export const isCalendarRsvp = (message: MessageResultData): boolean => message.Type === MessageType.CalendarRsvp && !!message.CalendarItemId;

/** A withheld (ADP) subject or body arrives as the sentinel; never show it as text. */
export const isWithheld = (value: string | null | undefined): boolean => isRedactedValue(value);

export const matchesMessageQuery = (message: MessageResultData, query: string): boolean => {
  const needle = query.trim().toLowerCase();

  if (!needle) return true;

  return [message.Subject, message.Body, message.SendingName].some((value) => !isWithheld(value) && (value ?? '').toLowerCase().includes(needle));
};

export interface MessageListItem {
  message: MessageResultData;
  /** From the outbox (the caller sent it). */
  isOwn: boolean;
}

/** The list for a filter: inbox and/or outbox, newest first, de-duplicated (a message to yourself is in both), searched. */
export const buildMessageList = (inbox: readonly MessageResultData[], sent: readonly MessageResultData[], filter: MessageFilter, query: string): MessageListItem[] => {
  const items: MessageListItem[] = [];
  const seen = new Set<string>();

  const add = (message: MessageResultData, isOwn: boolean) => {
    if (seen.has(message.MessageId)) return;
    seen.add(message.MessageId);
    items.push({ message, isOwn });
  };

  if (filter !== 'sent') inbox.forEach((message) => add(message, false));

  if (filter !== 'inbox') sent.forEach((message) => add(message, true));
  const at = (item: MessageListItem) => parseUtcMs(item.message.SentOnUtc) ?? parseDateISOString(item.message.SentOn)?.getTime() ?? 0;

  return items.filter((item) => matchesMessageQuery(item.message, query)).sort((a, b) => at(b) - at(a));
};

// ── Recipients ─────────────────────────────────────────────────────

export type RecipientTab = 'personnel' | 'groups' | 'roles';

/** The picker's sections, in this order. */
export const RECIPIENT_TABS: readonly RecipientTab[] = ['personnel', 'groups', 'roles'];

/** What the compose form picked: "everyone" (Core's "Everyone" row) or people, groups and roles by `GetRecipients` id. */
export type MessageRecipientSelection = RecipientPickerSelection<RecipientTab>;

/** The picker section for each `GetRecipients` row type (units are listed by Core but never messaged). */
const ROW_TYPE_TABS = new Map<string, RecipientTab>([
  ['Personnel', 'personnel'],
  ['Groups', 'groups'],
  ['Roles', 'roles'],
]);

/** Core `MessageRecipientInput.Type` per section (0 is "Everyone"). */
const TAB_INPUT_TYPES: Record<RecipientTab, number> = { personnel: 1, groups: 2, roles: 3 };

/** The "Everyone" row (`Id` 0); Core sends to every active member when a recipient is named "Everyone". */
export const isEveryoneRecipient = (recipient: Pick<RecipientsResultData, 'Id' | 'Name' | 'Type'>): boolean => !recipient.Type && (recipient.Id === '0' || recipient.Name === 'Everyone');

export const recipientTab = (recipient: Pick<RecipientsResultData, 'Type'>): RecipientTab | null => ROW_TYPE_TABS.get(recipient.Type) ?? null;

/** The recipient picker's sections — people, groups and roles in the order Core lists them. Never units; "Everyone" is the picker's own switch. */
export function recipientSections(recipients: readonly RecipientsResultData[], labels: Record<RecipientTab, string>): RecipientPickerSection<RecipientTab>[] {
  const entries: Record<RecipientTab, RecipientPickerEntry[]> = { personnel: [], groups: [], roles: [] };

  for (const recipient of recipients) {
    const tab = recipientTab(recipient);

    if (tab) entries[tab].push({ id: recipient.Id, name: recipient.Name });
  }

  return RECIPIENT_TABS.map((tab) => ({ key: tab, label: labels[tab], entries: entries[tab] }));
}

/** Recipients a selection names; "everyone" counts as one. */
export const messageRecipientCount = (selection: MessageRecipientSelection): number => (selection.everyone ? 1 : RECIPIENT_TABS.reduce((total, tab) => total + (selection.ids[tab]?.length ?? 0), 0));

/**
 * Core's `Recipients` for a selection: "everyone" is the one "Everyone" row as Core listed it (Core matches it by name);
 * otherwise people, then groups, then roles, typed by their section.
 */
export function toMessageRecipients(selection: MessageRecipientSelection, recipients: readonly RecipientsResultData[]): MessageRecipientInput[] {
  if (selection.everyone) {
    const everyone = recipients.find(isEveryoneRecipient);

    return everyone ? [{ Id: everyone.Id, Type: 0, Name: everyone.Name }] : [];
  }

  const byId = new Map(recipients.map((recipient) => [recipient.Id, recipient]));

  return RECIPIENT_TABS.flatMap((tab) => (selection.ids[tab] ?? []).map((id) => ({ Id: id, Type: TAB_INPUT_TYPES[tab], Name: byId.get(id)?.Name ?? '' })));
}
