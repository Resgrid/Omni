import { useShellInboxReady } from '@resgrid/app-shell';
import { NotificationsInboxScreen } from '@resgrid/features/notifications';
import React from 'react';

/**
 * The inbox route's screen: the feature screen fed with the shell's Novu readiness (the shell owns the provider and its
 * credentials; the feature never imports the shell). Route files re-export this.
 */
export default function NotificationsInboxRoute() {
  const ready = useShellInboxReady();
  return <NotificationsInboxScreen isReady={ready} />;
}
