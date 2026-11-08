import { useCapability } from '@resgrid/config';
import { isCallActiveState } from '@resgrid/data';
import type { CallDetailActionProps } from '@resgrid/features/calls';
import { UnitStatusSheet, useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, useToast } from '@resgrid/ui';
import React, { useCallback, useState } from 'react';

/**
 * "Set Active" beside a call's title on its detail screen (legacy Unit call detail): makes the call the crew's active
 * call, then opens the unit status sheet for it. The call is the destination, so the sheet skips its destination step
 * and asks for the status, then a note. Cancelling the sheet keeps the call active, as in legacy Unit.
 *
 * Shown only where the device reports status for a unit (`capabilities.status.subject`, i.e. Unit), with an active unit
 * and a shell that owns the active call, for an open call that is not the active call already. The sheet stays mounted
 * while the button hides, so setting the call active does not close it.
 */
export const SetActiveCallButton: React.FC<CallDetailActionProps> = ({ call }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { subject } = useCapability('status');
  const { activeUnitId, activeCallId, onActiveCallChange } = useStatusContext();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const setActive = useCallback(() => {
    onActiveCallChange?.(call.CallId);
    toast.success(t('call_detail.set_active_success'));
    setIsSheetOpen(true);
  }, [call.CallId, onActiveCallChange, t, toast]);

  if (subject !== 'unit' || !activeUnitId || !onActiveCallChange) return null;

  return (
    <>
      {isCallActiveState(call.State) && call.CallId !== activeCallId ? (
        <Button size="sm" className="ml-2" onPress={setActive} accessibilityLabel={t('call_detail.set_active')} testID="call-detail-set-active">
          <ButtonText>{t('call_detail.set_active')}</ButtonText>
        </Button>
      ) : null}
      <UnitStatusSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} unitId={activeUnitId} fixedCall={call} />
    </>
  );
};
