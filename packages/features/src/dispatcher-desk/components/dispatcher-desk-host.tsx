import { DESK_PRESENCE_KEY, useDispatcherDeskStore } from '@resgrid/data';
import { CallConfirmDialog } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import React from 'react';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDeskAlerts } from '../hooks/use-desk-alerts';
import { useDispatcherDeskSync, useDispatcherDeskView, useIsDispatcherDeskEnabled } from '../hooks/use-dispatcher-desk';
import { useDeskUiStore } from '../lib/desk-ui-store';
import { OfferAlert } from './offer-alert';
import { SignInSheet } from './sign-in-sheet';
import { TakeBreakSheet } from './take-break-sheet';

/** The desk's announcements and sheets; only mounted where the app has the desk. */
const DeskOverlays: React.FC = () => {
  const { t } = useTranslation();
  const { offer, moreOffers } = useDeskAlerts();
  const { me, isAvailable } = useDispatcherDeskView();
  const sheet = useDeskUiStore((state) => state.sheet);
  const request = useDeskUiStore((state) => state.request);
  const closeSheet = useDeskUiStore((state) => state.closeSheet);
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(DESK_PRESENCE_KEY));
  const held = me?.ActiveItemCount ?? 0;

  if (!isAvailable) return null;

  return (
    <>
      <OfferAlert offer={offer} moreOffers={moreOffers} />
      <SignInSheet isOpen={sheet === 'signIn'} onClose={closeSheet} />
      <TakeBreakSheet isOpen={sheet === 'takeBreak'} onClose={closeSheet} plannedBreakId={request.plannedBreakId ?? null} />
      <CallConfirmDialog
        isOpen={sheet === 'signOff'}
        title={t('dispatcher_desk.sign_off.title')}
        message={held > 0 ? t('dispatcher_desk.sign_off.message_holding', { count: held }) : t('dispatcher_desk.sign_off.message')}
        confirmLabel={t('dispatcher_desk.actions.sign_off')}
        cancelLabel={t('common.cancel')}
        destructive={held > 0}
        isBusy={busy}
        onConfirm={() => {
          void actions
            .run(() => useDispatcherDeskStore.getState().signOff(), { success: t('dispatcher_desk.sign_off.done') })
            .then((outcome) => {
              if (outcome.ok) closeSheet();
            });
        }}
        onCancel={closeSheet}
        testID="desk-sign-off-dialog"
      />
    </>
  );
};

const DeskSync: React.FC = () => {
  useDispatcherDeskSync();

  return <DeskOverlays />;
};

/**
 * Mount once inside the signed-in shell: keeps the desk live (`useDispatcherDeskSync`: board, realtime, heartbeat, the
 * desk push subscriber, quiet on break), shows the offer alert and the break alerts, and draws the sign-in, take-a-break
 * and sign-off sheets the status bar and screens open. Inert without `capabilities.calls.dispatcherDesk`.
 */
export const DispatcherDeskHost: React.FC = () => {
  const enabled = useIsDispatcherDeskEnabled();

  return enabled ? <DeskSync /> : null;
};
