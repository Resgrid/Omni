import { useCallProtocolStepsStore, withQueuedSteps } from '@resgrid/data';
import { OptionSheet } from '@resgrid/features/auth-ui/components/option-sheet';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolChecklistResultData, ProtocolStepResultData, ProtocolStepStateValue } from '@resgrid/models';
import { ProtocolStepState } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Spinner, Text, useThemeColors, useToast, VStack, ZeroState } from '@resgrid/ui';
import { Ban, Check, ListChecks, Plus, SkipForward } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { groupSteps, stepStateKey } from '../lib/protocol-library';

export interface CallProtocolStepsProps {
  callId: string;
  /** The member may edit the call (Core's CanUserEditCallAsync): only then can steps be ticked or a procedure started. */
  canEdit: boolean;
}

const NO_CHECKLISTS: CallProtocolChecklistResultData[] = [];

/** Tapping the state a step already has sends it back to pending; any other state is recorded as is. */
export const nextStepState = (current: number, tapped: ProtocolStepStateValue): ProtocolStepStateValue => (current === tapped ? ProtocolStepState.Pending : tapped);

const STEP_ACTIONS: readonly { state: ProtocolStepStateValue; icon: typeof Check; labelKey: string }[] = [
  { state: ProtocolStepState.Done, icon: Check, labelKey: 'protocols.steps.mark_done' },
  { state: ProtocolStepState.Skipped, icon: SkipForward, labelKey: 'protocols.steps.mark_skipped' },
  { state: ProtocolStepState.NotApplicable, icon: Ban, labelKey: 'protocols.steps.mark_na' },
];

const StepRow: React.FC<{ step: ProtocolStepResultData; index: number; enabled: boolean; onSet: (step: ProtocolStepResultData, state: ProtocolStepStateValue) => void; testID: string }> = ({
  step,
  index,
  enabled,
  onSet,
  testID,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <VStack space="xs" className="border-b border-outline-100 py-2" testID={testID}>
      <HStack space="sm" className="items-start">
        <Text size="sm" className={`flex-1 ${step.State === ProtocolStepState.Pending ? 'text-typography-900' : 'text-typography-500'}`}>{`${index + 1}. ${step.Text ?? ''}`}</Text>
        <Text size="xs" className="text-typography-600" testID={`${testID}-state`}>
          {t(stepStateKey(step.State))}
        </Text>
      </HStack>
      {enabled ? (
        <HStack space="sm">
          {STEP_ACTIONS.map((action) => {
            const Icon = action.icon;
            const active = step.State === action.state;

            return (
              <Pressable
                key={action.state}
                onPress={() => onSet(step, action.state)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t(action.labelKey)}: ${step.Text ?? ''}`}
                testID={`${testID}-set-${action.state}`}
                className={`flex-row items-center rounded-md border px-2 py-1 ${active ? 'border-primary-500 bg-primary-50' : 'border-outline-200'}`}
              >
                <View>
                  <Icon size={14} color={active ? colors.primary : colors.icon} />
                </View>
                <Text size="xs" className="ml-1 text-typography-700">
                  {t(action.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </HStack>
      ) : null}
    </VStack>
  );
};

/**
 * A call's protocol steps (protocols plan P3, apps with `protocols.stepThrough`): each checklist on the call with its steps,
 * who and when; members who may edit the call tick steps done, skipped or not applicable (queued offline and sent with the
 * device time), complete a checklist and start an incident SOP (MAYDAY, RIT, hazmat entry) from the department's library.
 */
export const CallProtocolSteps: React.FC<CallProtocolStepsProps> = ({ callId, canEdit }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const stored = useCallProtocolStepsStore((state) => state.checklistsByCall[callId] ?? NO_CHECKLISTS);
  const queued = useCallProtocolStepsStore((state) => state.queuedSteps);
  const sopLibrary = useCallProtocolStepsStore((state) => state.sopLibrary);
  const isLoading = useCallProtocolStepsStore((state) => state.loading.checklists === true);
  const error = useCallProtocolStepsStore((state) => state.errors.checklists ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const checklists = useMemo(() => withQueuedSteps(stored, queued), [stored, queued]);
  const startable = useMemo(() => sopLibrary.filter((item) => !checklists.some((checklist) => checklist.ProtocolId === item.ProtocolId)), [checklists, sopLibrary]);

  const refresh = useCallback(() => useCallProtocolStepsStore.getState().fetchChecklists(callId, { bypassCache: true }), [callId]);

  useEffect(() => {
    void useCallProtocolStepsStore.getState().fetchChecklists(callId);

    if (canEdit) void useCallProtocolStepsStore.getState().fetchSopLibrary();
  }, [callId, canEdit]);

  const setStep = useCallback(
    async (checklist: CallProtocolChecklistResultData, step: ProtocolStepResultData, tapped: ProtocolStepStateValue) => {
      const result = await useCallProtocolStepsStore.getState().recordStep({ callId, callProtocolId: checklist.CallProtocolId, stepId: step.Id, state: nextStepState(step.State, tapped) });

      if (result.outcome === 'queued') toast.info(t('protocols.steps.queued'));
      else if (result.outcome === 'rejected') toast.error(t('protocols.steps.rejected'));
    },
    [callId, t, toast]
  );

  const complete = async (checklist: CallProtocolChecklistResultData) => {
    setBusy(checklist.CallProtocolId);

    try {
      const done = await useCallProtocolStepsStore.getState().completeChecklist(callId, checklist.CallProtocolId);

      if (!done) toast.error(t('protocols.steps.action_failed'));
    } finally {
      setBusy(null);
    }
  };

  const start = async (protocolId: string) => {
    setPickerOpen(false);
    setBusy('start');

    try {
      const started = await useCallProtocolStepsStore.getState().startChecklist(callId, protocolId);

      if (!started) toast.error(t('protocols.steps.action_failed'));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && checklists.length === 0) return <Spinner testID="call-protocol-steps-loading" />;

  return (
    <VStack space="md" className="p-4" testID="call-protocol-steps">
      {checklists.length === 0 ? (
        error ? (
          <ZeroState isError heading={t('protocols.steps.load_failed')} description={t(error.messageKey)} onRetry={refresh} testID="call-protocol-steps-error" />
        ) : (
          <ZeroState icon={ListChecks} heading={t('protocols.steps.empty')} description={t('protocols.steps.empty_description')} onRetry={refresh} testID="call-protocol-steps-empty" />
        )
      ) : (
        checklists.map((checklist) => {
          const completed = !!checklist.CompletedOn;
          const enabled = canEdit && !completed;
          const groups = groupSteps(checklist.Steps);
          const numbers = new Map(groups.flatMap((group) => group.steps).map((step, position) => [step.Id, position]));

          return (
            <View key={checklist.CallProtocolId} className="rounded-xl border border-outline-200 bg-background-0 p-4" testID={`call-checklist-${checklist.CallProtocolId}`}>
              <HStack space="sm" className="mb-1 items-center">
                <Text className="flex-1 font-semibold text-typography-900" accessibilityRole="header">
                  {[checklist.Code, checklist.Name].filter(Boolean).join(' · ')}
                </Text>
                <Text size="xs" className="text-typography-600" testID={`call-checklist-${checklist.CallProtocolId}-progress`}>
                  {t('protocols.steps.progress', { done: checklist.Done, total: checklist.Total })}
                </Text>
              </HStack>
              <Text size="xs" className="mb-2 text-typography-500">
                {[checklist.VersionLabel ? t('protocols.version_label', { label: checklist.VersionLabel }) : null, completed ? t('protocols.steps.completed') : null].filter(Boolean).join(' · ')}
              </Text>
              {groups.map((group, groupIndex) => (
                <VStack key={`${group.group ?? ''}-${groupIndex}`}>
                  {group.group ? <Text className="mt-2 text-sm font-semibold text-typography-800">{group.group}</Text> : null}
                  {group.steps.map((step) => (
                    <StepRow
                      key={step.Id}
                      step={step}
                      index={numbers.get(step.Id) ?? 0}
                      enabled={enabled}
                      onSet={(target, state) => void setStep(checklist, target, state)}
                      testID={`call-step-${checklist.CallProtocolId}-${step.Id}`}
                    />
                  ))}
                </VStack>
              ))}
              {enabled ? (
                <Button variant="outline" className="mt-3" onPress={() => void complete(checklist)} isDisabled={busy !== null} testID={`call-checklist-${checklist.CallProtocolId}-complete`}>
                  {busy === checklist.CallProtocolId ? <ButtonSpinner color={colors.primary} /> : <ButtonText>{t('protocols.steps.complete')}</ButtonText>}
                </Button>
              ) : null}
            </View>
          );
        })
      )}
      {canEdit && startable.length > 0 ? (
        <Button variant="outline" onPress={() => setPickerOpen(true)} isDisabled={busy !== null} testID="call-protocol-steps-start">
          {busy === 'start' ? (
            <ButtonSpinner color={colors.primary} />
          ) : (
            <>
              <View>
                <Plus size={16} color={colors.primary} />
              </View>
              <ButtonText>{t('protocols.steps.start')}</ButtonText>
            </>
          )}
        </Button>
      ) : null}
      <OptionSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('protocols.steps.start')}
        options={startable.map((item) => ({ value: item.ProtocolId, label: [item.Code, item.Name].filter(Boolean).join(' · ') }))}
        selected={null}
        onSelect={(value) => void start(value)}
        testID="call-protocol-steps-picker"
      />
    </VStack>
  );
};
