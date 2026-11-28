import { acknowledgeProtocol, answerWeeklyProtocolQuestion, getMyProtocolAcknowledgments, getProtocolBankQuiz, getWeeklyProtocolQuestions, submitProtocolBankQuiz } from '@resgrid/api';
import type { AcknowledgeProtocolResult, AcknowledgeProtocolResultData, ProtocolAcknowledgmentResultData, ProtocolMicroLearningItem, ProtocolQuizAnswer, ProtocolQuizResult, ProtocolQuizView } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { classifyDataWriteError, defineDataHandler, retryWriteNow, submitWrite } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, type DataStepUpRequirement, dataStepUpRequirementOf, getDataApiContext, getDataLogger, onDataStepUpVerified, requestDataStepUp } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type AcknowledgmentsSlice = 'mine' | 'weekly';

export const PROTOCOL_ACKNOWLEDGE_EVENT = 'protocols.acknowledge';

/** A read-and-sign in the outbox: the version and the content hash the member read, and when they signed on the device. */
export interface ProtocolAcknowledgePayload {
  protocolVersionId: number;
  contentHash: string;
  signedOnDevice: string;
}

/** A signed acknowledgment waiting for the department's step-up (kept, never dropped, until the member verifies). */
export interface HeldAcknowledgment {
  protocolVersionId: number;
  /** The outbox write that waits. */
  eventId: string;
  requirement: DataStepUpRequirement;
}

/** The outbox error code of a signing held for the department's step-up. */
const STEP_UP_HELD = 'step_up_required';

/** A signing the department's step-up refused: retried (never dead-lettered) until the member verifies. */
export class AcknowledgmentHeldForStepUpError extends Error {
  public readonly code = STEP_UP_HELD;

  constructor(public readonly requirement: DataStepUpRequirement) {
    super('Waiting for the step-up');
    this.name = 'AcknowledgmentHeldForStepUpError';
  }
}

/**
 * What signing came to: Core's answer (Acknowledged, AwaitingQuiz, ReadNewerVersion…), `Queued` (saved on this device, sent once
 * online) or `AwaitingStepUp` (kept until the member verifies it is them).
 */
export type AcknowledgeResult = { kind: 'answered'; data: AcknowledgeProtocolResultData } | { kind: 'queued' } | { kind: 'awaiting_step_up' } | { kind: 'failed' };

/** Core's acknowledgment statuses (`ProtocolAcknowledgmentResultData.Status`). */
export const AcknowledgmentStatus = { Open: 'open', AwaitingQuiz: 'awaiting_quiz', Acknowledged: 'acknowledged' } as const;

/** A quiz answer from the server: the view, or the refusal code (`ProtocolLearningErrors` name). */
export interface BankQuizStart {
  quiz: ProtocolQuizView | null;
  error: string | null;
}

export interface BankQuizOutcome {
  result: ProtocolQuizResult | null;
  error: string | null;
}

interface AcknowledgmentsData extends SliceMeta<AcknowledgmentsSlice> {
  /** The member's acknowledgments (open and awaiting a quiz first; completed ones once asked for). */
  acknowledgments: ProtocolAcknowledgmentResultData[];
  /** The member's weekly micro-learning questions (LMS), newest first. */
  weekly: ProtocolMicroLearningItem[];
  /** Signed acknowledgments the department's step-up holds back, by version. */
  held: HeldAcknowledgment[];
  /** Core's last answer per version (set when a queued or immediate signing is delivered). */
  outcomes: Record<number, AcknowledgeProtocolResultData>;
  actionError: DataError | null;
}

export interface ProtocolAcknowledgmentsState extends AcknowledgmentsData {
  fetchAcknowledgments: (options?: FetchOptions & { includeCompleted?: boolean }) => Promise<void>;
  /**
   * Read-and-sign through the outbox: sent at once when online, queued offline and replayed with the device's signing time. When
   * the department asks for a step-up, the sheet opens and the signing is sent again once verified; not verified, it is held.
   */
  acknowledge: (protocolVersionId: number, contentHash: string) => Promise<AcknowledgeResult>;
  /** The member verifies for held signings now; once verified, they are sent. */
  verifyHeld: (protocolVersionId: number) => Promise<boolean>;
  holdForStepUp: (held: HeldAcknowledgment) => void;
  /** Records Core's answer for a version and lifts the step-up hold `eventId` owns (another signing's hold stays). */
  settleAcknowledgment: (protocolVersionId: number, outcome: AcknowledgeProtocolResultData | null, eventId: string) => void;
  startBankQuiz: (protocolVersionId: number, locale?: string) => Promise<BankQuizStart>;
  submitBankQuiz: (attemptId: number, answers: ProtocolQuizAnswer[]) => Promise<BankQuizOutcome>;
  fetchWeekly: (options?: FetchOptions) => Promise<void>;
  /** Answers a weekly question once; the answered item (correct keys, explanation) or null. */
  answerWeekly: (id: number, keys: string[]) => Promise<ProtocolMicroLearningItem | null>;
}

const initialData = (): AcknowledgmentsData => ({ ...emptySliceMeta<AcknowledgmentsSlice>(), acknowledgments: [], weekly: [], held: [], outcomes: {}, actionError: null });

/** Whether an acknowledgment still asks something of the member. */
export const isAcknowledgmentOwed = (item: Pick<ProtocolAcknowledgmentResultData, 'Status'>): boolean => item.Status !== AcknowledgmentStatus.Acknowledged;

/** The member's owed acknowledgment of a protocol (any version), bulletins and the oldest assignment first. */
export function selectOwedAcknowledgment(list: readonly ProtocolAcknowledgmentResultData[], protocolId: string | number | null | undefined): ProtocolAcknowledgmentResultData | null {
  if (protocolId === null || protocolId === undefined || protocolId === '') return null;

  return list.find((item) => String(item.ProtocolId) === String(protocolId) && isAcknowledgmentOwed(item)) ?? null;
}

let runner: SliceRunner<AcknowledgmentsSlice, ProtocolAcknowledgmentsState>;

/** One order group per version: a held or queued signing never blocks another protocol's. */
export const acknowledgeOrderKey = (protocolVersionId: number): string => `protocol-ack:${protocolVersionId}`;

/** A signing sent within a minute of being made, from the member's own tap, is the member reading online; anything later is a replay. */
const ONLINE_WINDOW_MS = 60_000;

/**
 * Which sends are the member's online read. Kept in memory on purpose: only a send made while the member's sign tap is still
 * running (or its step-up retry soon after) is online; every other send, including one queued by an older build or replayed
 * after the app restarted, is an offline signing with the device's time.
 */
const signing = {
  /** Sign taps in progress, by version (how many). */
  taps: new Map<number, number>(),
  /** Outbox events queued by a tap still in progress, with their version (forgotten when that version's taps end). */
  tapped: new Map<string, number>(),
  /** Events whose first attempt was made during the tap: the online read, until delivered or abandoned. */
  readOnline: new Set<string>(),
  /** Tapped events the server refused for good while the tap waited on them (forgotten with `tapped`). */
  refused: new Set<string>(),
};

const startSigningTap = (protocolVersionId: number): void => {
  signing.taps.set(protocolVersionId, (signing.taps.get(protocolVersionId) ?? 0) + 1);
};

const endSigningTap = (protocolVersionId: number): void => {
  const left = (signing.taps.get(protocolVersionId) ?? 1) - 1;

  if (left > 0) {
    signing.taps.set(protocolVersionId, left);

    return;
  }

  signing.taps.delete(protocolVersionId);

  for (const [eventId, version] of signing.tapped) {
    if (version === protocolVersionId) {
      signing.tapped.delete(eventId);
      signing.refused.delete(eventId);
    }
  }
};

/** Keeps the locally answered copy of a weekly question a read that started before the answer still shows as open (answering is final). */
export function mergeWeeklyAnswers(fetched: readonly ProtocolMicroLearningItem[], local: readonly ProtocolMicroLearningItem[]): ProtocolMicroLearningItem[] {
  const answered = new Map(local.flatMap((item) => (item.AnsweredOn ? [[item.Id, item] as const] : [])));

  return fetched.map((item) => (item.AnsweredOn ? item : (answered.get(item.Id) ?? item)));
}

/**
 * Protocol read-and-sign (protocols plan P2) for the apps with `capabilities.protocols.acknowledgments`: the member's
 * acknowledgments (persisted, so the list shows offline), signing a version they read, and the question-bank quiz a version
 * may ask for (scored on the server). Signing goes through the outbox (queued offline, held for the department's step-up); quizzes are
 * online only.
 */
export const useProtocolAcknowledgmentsStore = create<ProtocolAcknowledgmentsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<AcknowledgmentsSlice, ProtocolAcknowledgmentsState>('protocolAcknowledgments', set);
      const ctx = () => getDataApiContext();
      const refresh = () => get().fetchAcknowledgments({ bypassCache: true });
      const isHeld = (protocolVersionId: number) => get().held.some((item) => item.protocolVersionId === protocolVersionId);

      // `failed` when the server refused this signing for good (after its step-up retry too); `queued` only while it can still be sent.
      const answeredOrQueued = (protocolVersionId: number, eventId: string): AcknowledgeResult => {
        if (signing.refused.has(eventId)) return { kind: 'failed' };
        const data = get().outcomes[protocolVersionId];

        return data ? { kind: 'answered', data } : { kind: 'queued' };
      };

      return {
        ...initialData(),
        fetchAcknowledgments: async (options) => {
          const includeCompleted = options?.includeCompleted === true;

          await runner.run(
            'mine',
            async () => unwrapList(await getMyProtocolAcknowledgments(ctx(), includeCompleted ? { includeCompleted: true } : {})),
            (acknowledgments) => ({ acknowledgments }),
            // The two forms never share an answer; both fill one list, so the request made last wins (one race lane).
            { flightKey: includeCompleted ? 'mine:all' : 'mine:owed', trailing: options?.bypassCache === true }
          );
        },
        fetchWeekly: async (options) => {
          await runner.run(
            'weekly',
            async () => unwrapList(await getWeeklyProtocolQuestions(ctx())),
            // A read that started before an answer must not show that question as open again.
            (weekly, state) => ({ weekly: mergeWeeklyAnswers(weekly, state.weekly) }),
            { trailing: options?.bypassCache === true }
          );
        },
        answerWeekly: async (id, keys) => {
          const startedIn = runner.generation();

          set({ actionError: null });

          try {
            const answered = (await answerWeeklyProtocolQuestion(ctx(), { Id: id, Keys: keys }))?.Data ?? null;

            if (runner.generation() !== startedIn) return null;

            if (answered) set((state) => ({ weekly: state.weekly.map((item) => (item.Id === id ? answered : item)) }));

            return answered;
          } catch (error) {
            if (runner.generation() === startedIn) set({ actionError: toDataError(error) });

            return null;
          }
        },
        acknowledge: async (protocolVersionId, contentHash) => {
          // A new signing: an earlier answer for this version is not this one's.
          set((state) => ({ actionError: null, outcomes: Object.fromEntries(Object.entries(state.outcomes).filter(([id]) => Number(id) !== protocolVersionId)) }));
          startSigningTap(protocolVersionId);

          try {
            const write = await submitWrite<ProtocolAcknowledgePayload>({
              type: PROTOCOL_ACKNOWLEDGE_EVENT,
              payload: { protocolVersionId, contentHash, signedOnDevice: new Date(dataNow()).toISOString() },
              orderKey: acknowledgeOrderKey(protocolVersionId),
            });

            if (write.outcome === 'rejected') return { kind: 'failed' };

            // Not held: sent (by this drain or the outbox's own pass that started first) or queued for later.
            if (write.outcome === 'sent' || !isHeld(protocolVersionId)) return answeredOrQueued(protocolVersionId, write.id);

            // The member just tapped sign: ask for the step-up now (the drain never waits on the member), then send it again.
            await get().verifyHeld(protocolVersionId);

            return isHeld(protocolVersionId) ? { kind: 'awaiting_step_up' } : answeredOrQueued(protocolVersionId, write.id);
          } finally {
            endSigningTap(protocolVersionId);
          }
        },
        verifyHeld: async (protocolVersionId) => {
          const held = get().held.find((item) => item.protocolVersionId === protocolVersionId);

          if (!held) return false;

          const verified = await requestDataStepUp(held.requirement);

          if (verified) await retryWriteNow(held.eventId, acknowledgeOrderKey(protocolVersionId));

          return verified;
        },
        holdForStepUp: (held) => set((state) => ({ held: [...state.held.filter((item) => item.protocolVersionId !== held.protocolVersionId), held] })),
        settleAcknowledgment: (protocolVersionId, outcome, eventId) =>
          set((state) => ({
            held: state.held.filter((item) => item.eventId !== eventId),
            outcomes: outcome ? { ...state.outcomes, [protocolVersionId]: outcome } : state.outcomes,
          })),
        startBankQuiz: async (protocolVersionId, locale) => {
          try {
            const params: Parameters<typeof getProtocolBankQuiz>[1] = { protocolVersionId };

            if (locale) params.locale = locale;

            const result = await getProtocolBankQuiz(ctx(), params);

            return { quiz: result?.Data ?? null, error: result?.Data ? null : (result?.Error ?? 'NotFound') };
          } catch (error) {
            return { quiz: null, error: toDataError(error).code };
          }
        },
        submitBankQuiz: async (attemptId, answers) => {
          try {
            const result = await submitProtocolBankQuiz(ctx(), { AttemptId: attemptId, Answers: answers });
            await refresh();

            return { result: result?.Data ?? null, error: result?.Error && result.Error !== 'None' ? result.Error : null };
          } catch (error) {
            return { result: null, error: toDataError(error).code };
          }
        },
      };
    },
    dataPersistOptions<ProtocolAcknowledgmentsState, Pick<AcknowledgmentsData, 'acknowledgments' | 'weekly' | 'held' | 'fetchedAt'>>({
      name: 'omni-protocol-acknowledgments-storage',
      partialize: (state) => ({ acknowledgments: state.acknowledgments, weekly: state.weekly, held: state.held, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-protocol-acknowledgments-storage', useProtocolAcknowledgmentsStore);

registerDataStoreReset<ProtocolAcknowledgmentsState>('protocolAcknowledgments', useProtocolAcknowledgmentsStore, initialData, () => runner.invalidate());

/**
 * Read-and-sign delivery. Sent online it is the read itself (Core records it before signing); replayed it carries `Offline` and the
 * device's signing time, and Core accepts it only while that version is still the one in force. When the department asks for a
 * step-up (403 `step_up_required`), the signing is held — retried without limit and never dead-lettered — and the step-up sheet is
 * asked for outside the drain (so other queued writes keep going; a background replay never reopens a sheet the member closed).
 * A verification sends every held signing at once.
 */
export const protocolAcknowledgeHandler = defineDataHandler<ProtocolAcknowledgePayload, AcknowledgeProtocolResult>({
  type: PROTOCOL_ACKNOWLEDGE_EVENT,
  classify: (error) => (error instanceof AcknowledgmentHeldForStepUpError ? 'retry' : classifyDataWriteError(error)),
  maxAttemptsFor: (failure) => (failure.code === STEP_UP_HELD ? Number.MAX_SAFE_INTEGER : undefined),
  optimisticApply: (event) => {
    // Queued by the member's sign tap now running (enqueue hands only a new event to this, inside that tap's submitWrite).
    if (signing.taps.has(event.payload.protocolVersionId)) signing.tapped.set(event.id, event.payload.protocolVersionId);
  },
  send: async (event, context) => {
    // Online only when the first attempt is made during the member's tap (a signing queued offline and sent on reconnect is not,
    // however soon), or it is that read's retry after a step-up hold, sent soon after. A replay after a lost connection is not.
    const heldForStepUp = useProtocolAcknowledgmentsStore.getState().held.some((item) => item.eventId === event.id);

    if (context.attempt === 1 && signing.tapped.has(event.id)) signing.readOnline.add(event.id);
    const online = signing.readOnline.has(event.id) && (context.attempt === 1 || heldForStepUp) && dataNow() - event.createdAt <= ONLINE_WINDOW_MS;
    const offline = !online;

    const body = {
      ProtocolVersionId: event.payload.protocolVersionId,
      ContentHash: event.payload.contentHash,
      Offline: offline,
      SignedOnDevice: offline ? event.payload.signedOnDevice : null,
    };

    try {
      return await acknowledgeProtocol(getDataApiContext(), body);
    } catch (error) {
      const requirement = dataStepUpRequirementOf(error);

      if (!requirement) throw error;
      useProtocolAcknowledgmentsStore.getState().holdForStepUp({ protocolVersionId: event.payload.protocolVersionId, eventId: event.id, requirement });

      // Not awaited: the sheet is the member's, the drain goes on. The first, online attempt leaves it to `acknowledge`.
      if (offline) void requestDataStepUp(requirement, { interactive: false });
      throw new AcknowledgmentHeldForStepUpError(requirement);
    }
  },
  afterAck: (event, result) => {
    signing.readOnline.delete(event.id);
    useProtocolAcknowledgmentsStore.getState().settleAcknowledgment(event.payload.protocolVersionId, result?.Data ?? null, event.id);
  },
  refresh: () => useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments({ bypassCache: true }),
  rollback: (event, reason) => {
    // The tap still waiting on this signing (its step-up retry) reports it refused, not queued.
    if (reason === 'dead' && signing.tapped.has(event.id)) signing.refused.add(event.id);
    signing.readOnline.delete(event.id);
    // Only this signing's own hold: another signing of the version may still wait for the step-up behind it.
    useProtocolAcknowledgmentsStore.getState().settleAcknowledgment(event.payload.protocolVersionId, null, event.id);
  },
});

/** Sends every held signing now. Nothing awaits the caller, so a failed retry is logged (the signing stays held and queued), never thrown. */
async function retryHeldAcknowledgments(held: readonly HeldAcknowledgment[]): Promise<void> {
  try {
    await Promise.all(held.map((item) => retryWriteNow(item.eventId, acknowledgeOrderKey(item.protocolVersionId))));
  } catch (error) {
    getDataLogger().warn({
      message: 'Held acknowledgments could not be sent after the step-up',
      context: { operation: 'retryHeldAcknowledgments', count: held.length, error: error instanceof Error ? error.name : 'unknown' },
    });
  }
}

// A verification for acknowledgments (from this sheet or any other) sends every held signing now.
onDataStepUpVerified((area) => {
  if (area !== 'acknowledgments') return;
  void retryHeldAcknowledgments(useProtocolAcknowledgmentsStore.getState().held);
});
