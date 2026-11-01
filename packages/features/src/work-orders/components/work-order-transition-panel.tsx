import { useTranslation } from '@resgrid/i18n';
import type { WorkOrderDetail, WorkOrderTransition } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Input, InputField, Switch, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';

import { BLANK_TRANSITION_FIELDS, missingField, type TransitionFields, transitionNeeds } from '../lib/work-order-rules';
import { WorkOrderChoiceChips } from './choice-chips';

export interface WorkOrderTransitionPanelProps {
  detail: WorkOrderDetail;
  isBusy: boolean;
  /** Sends the transition at the order's current revision; resolves true when the server accepted it. */
  onSubmit: (input: Omit<WorkOrderTransition, 'Revision'>) => Promise<boolean>;
}

/** Move the order along: the statuses the server allows this person (`Transitions`), with the fields each one requires. */
export const WorkOrderTransitionPanel: React.FC<WorkOrderTransitionPanelProps> = ({ detail, isBusy, onSubmit }) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState('');
  const [fields, setFields] = useState<TransitionFields>(BLANK_TRANSITION_FIELDS);
  const [missing, setMissing] = useState<string | null>(null);
  const needs = useMemo(() => (target ? transitionNeeds(detail, Number(target)) : null), [detail, target]);
  const set = (patch: Partial<TransitionFields>) => setFields((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (!needs) return;
    const gap = missingField(needs, fields);
    if (gap) {
      setMissing(gap);
      return;
    }
    setMissing(null);
    const ok = await onSubmit({
      Status: Number(target),
      Reason: fields.reason.trim() || null,
      Resolution: fields.resolution.trim() || null,
      Cause: fields.cause.trim() || null,
      VerificationEvidence: fields.verification.trim() || null,
      DuplicateOfId: fields.duplicateOf.trim() || null,
      ConfirmTasksComplete: fields.confirmTasks,
    });
    if (ok) {
      setTarget('');
      setFields(BLANK_TRANSITION_FIELDS);
    }
  };

  return (
    <VStack space="sm" className="rounded-lg border border-outline-200 p-3" testID="work-order-transition">
      <Text className="font-semibold text-typography-900">{t('workOrders.transition.title')}</Text>
      <Text size="sm" className="text-typography-500">
        {t('workOrders.transition.pick')}
      </Text>
      <WorkOrderChoiceChips
        options={detail.Transitions.map((status) => ({ value: String(status), label: t(`workOrders.status.${status}`) }))}
        value={target}
        onChange={(value) => {
          setTarget(value);
          setMissing(null);
        }}
        accessibilityLabel={t('workOrders.transition.pick')}
        testID="work-order-transition-status"
      />
      {needs?.reason ? (
        <Input>
          <InputField
            value={fields.reason}
            onChangeText={(reason) => set({ reason })}
            placeholder={t('workOrders.transition.reason')}
            accessibilityLabel={t('workOrders.transition.reason')}
            maxLength={4000}
            testID="work-order-reason"
          />
        </Input>
      ) : null}
      {needs?.resolution ? (
        <Textarea>
          <TextareaInput
            value={fields.resolution}
            onChangeText={(resolution) => set({ resolution })}
            placeholder={t('workOrders.transition.resolution')}
            accessibilityLabel={t('workOrders.transition.resolution')}
            testID="work-order-resolution"
          />
        </Textarea>
      ) : null}
      {needs?.cause ? (
        <Input>
          <InputField value={fields.cause} onChangeText={(cause) => set({ cause })} placeholder={t('workOrders.transition.cause')} accessibilityLabel={t('workOrders.transition.cause')} testID="work-order-cause" />
        </Input>
      ) : null}
      {needs?.verification ? (
        <Input>
          <InputField
            value={fields.verification}
            onChangeText={(verification) => set({ verification })}
            placeholder={t('workOrders.transition.verification')}
            accessibilityLabel={t('workOrders.transition.verification')}
            testID="work-order-verification"
          />
        </Input>
      ) : null}
      {needs?.duplicateOf ? (
        <Input>
          <InputField
            value={fields.duplicateOf}
            onChangeText={(duplicateOf) => set({ duplicateOf })}
            placeholder={t('workOrders.transition.duplicateOf')}
            accessibilityLabel={t('workOrders.transition.duplicateOf')}
            testID="work-order-duplicate"
          />
        </Input>
      ) : null}
      {needs?.confirmTasks ? (
        <HStack className="items-center justify-between">
          <Text className="flex-1 text-typography-900">{t('workOrders.transition.confirmTasks')}</Text>
          <Switch value={fields.confirmTasks} onValueChange={(confirmTasks) => set({ confirmTasks })} accessibilityLabel={t('workOrders.transition.confirmTasks')} testID="work-order-confirm-tasks" />
        </HStack>
      ) : null}
      {missing ? (
        <Text size="sm" accessibilityRole="alert" className="text-error-600" testID="work-order-transition-missing">
          {t(`workOrders.transition.missing.${missing}`)}
        </Text>
      ) : null}
      <Button onPress={() => void submit()} isDisabled={isBusy || !target} testID="work-order-move">
        {isBusy ? <ButtonSpinner /> : null}
        <ButtonText>{t('workOrders.transition.apply')}</ButtonText>
      </Button>
    </VStack>
  );
};
