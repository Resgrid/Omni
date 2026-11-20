/**
 * Calls created by an external intake (Core M0323, call-intake-and-ai-destinations-plan.md): a text, email, chat or webhook
 * intake channel (`CallSources.Intake`) or Enhanced AI voice intake (`CallSources.VoiceIntake`) saves the call pending for a
 * dispatcher to review. Core fills the channel's type and name on the call lists and GetCall; older servers send no
 * `CallSource`, and nothing is said.
 */
import { type CallResultData, CallSources, IntakeChannelTypes } from '@resgrid/models';

export type IntakeSourceKind = 'intake' | 'voice';

export interface IntakeSource {
  kind: IntakeSourceKind;
  /** The intake channel's type (`IntakeChannelTypes`) when the server gives one this build knows; null otherwise. */
  channelType: IntakeChannelTypes | null;
  /** The intake channel's name ("Hospital transfer line") when the server gives it; null otherwise. */
  channelName: string | null;
}

/** "Via {channel type}" per channel type (each key also has a `_named` form, "Via {channel type}: {name}"). */
const CHANNEL_LABEL_KEYS: ReadonlyMap<IntakeChannelTypes, string> = new Map([
  [IntakeChannelTypes.Sms, 'calls.intake_source.via_sms'],
  [IntakeChannelTypes.Email, 'calls.intake_source.via_email'],
  [IntakeChannelTypes.WhatsApp, 'calls.intake_source.via_whatsapp'],
  [IntakeChannelTypes.Slack, 'calls.intake_source.via_slack'],
  [IntakeChannelTypes.Teams, 'calls.intake_source.via_teams'],
  [IntakeChannelTypes.Telegram, 'calls.intake_source.via_telegram'],
  [IntakeChannelTypes.Discord, 'calls.intake_source.via_discord'],
  [IntakeChannelTypes.GoogleChat, 'calls.intake_source.via_google_chat'],
  [IntakeChannelTypes.Webhook, 'calls.intake_source.via_webhook'],
  [IntakeChannelTypes.Voice, 'calls.intake_source.via_voice'],
]);

/** The wire value as a channel type this build knows; null for none or a newer type (the generic label then applies). */
const CHANNEL_TYPES: ReadonlyMap<number, IntakeChannelTypes> = new Map([...CHANNEL_LABEL_KEYS.keys()].map((type) => [Number(type), type]));

const toChannelType = (value: number | null | undefined): IntakeChannelTypes | null => (value === null || value === undefined ? null : (CHANNEL_TYPES.get(Number(value)) ?? null));

/** Where an intake call came from, or null for any other call (or a server that predates `CallSource`). */
export const callIntakeSource = (call: Pick<CallResultData, 'CallSource' | 'IntakeChannelName' | 'IntakeChannelType'> | null | undefined): IntakeSource | null => {
  const source = Number(call?.CallSource);

  if (source !== CallSources.Intake && source !== CallSources.VoiceIntake) return null;

  return {
    kind: source === CallSources.VoiceIntake ? 'voice' : 'intake',
    channelType: toChannelType(call?.IntakeChannelType),
    channelName: call?.IntakeChannelName?.trim() || null,
  };
};

/**
 * The badge's i18n key and its parameters: "Via {channel type}" (": {name}" when the channel has one); without a type, the
 * generic "Intake" / "Voice line" by the call's source (": {name}" when there is a name).
 */
export const intakeSourceLabel = (source: IntakeSource): { key: string; name?: string } => {
  const generic = source.kind === 'voice' ? 'calls.intake_source.voice' : 'calls.intake_source.intake';
  const base = source.channelType !== null ? (CHANNEL_LABEL_KEYS.get(source.channelType) ?? generic) : generic;

  return source.channelName ? { key: `${base}_named`, name: source.channelName } : { key: base };
};
