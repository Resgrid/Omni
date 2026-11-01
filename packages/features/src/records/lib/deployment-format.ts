import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { type RecordDeploymentConnectorData, type RecordDeploymentData, type RecordDeploymentReconciliationData, RmsConnectorRunOutcomes, RmsExternalOrderOwnership } from '@resgrid/models';

// Presentation helpers for deployments and connectors (RMS plan §4.1). Pure functions over the server's data:
// nothing here decides what a person may see or do, only how what came back is shown.

export type BadgeAction = 'muted' | 'info' | 'warning' | 'success' | 'error';

/** A server UTC timestamp for display (the shared parser; some arrive without "Z"), or '' when missing/unparsable. */
export const formatWhen = (timestamp: string | null | undefined): string => formatUtcInDepartmentTime(timestamp, null, { dateStyle: 'medium', timeStyle: 'short' });

/** True when an external ordering-system connector maintains this order's snapshots. */
export const isConnectorOwned = (deployment: Pick<RecordDeploymentData, 'OwnershipMarker'> | null | undefined): boolean => (deployment?.OwnershipMarker ?? '').toLowerCase() === RmsExternalOrderOwnership.Connector;

export const deploymentStatusAction = (status: string | null | undefined): BadgeAction => {
  switch ((status ?? '').toLowerCase()) {
    case 'open':
      return 'info';
    case 'mobilized':
      return 'warning';
    case 'released':
      return 'success';
    default:
      return 'muted';
  }
};

export const fillStatusAction = (status: string | null | undefined): BadgeAction => {
  switch ((status ?? '').toLowerCase()) {
    case 'accepted':
    case 'assigned':
      return 'info';
    case 'mobilized':
    case 'checkedin':
      return 'warning';
    case 'released':
    case 'demobilized':
    case 'returned':
      return 'success';
    case 'declined':
      return 'error';
    default:
      return 'muted';
  }
};

/** Translation suffix for a status name as the API spells it (CheckedIn → checked_in). */
export const statusKey = (status: string | null | undefined): string => (status ?? '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

export const runOutcomeAction = (outcome: string | null | undefined): BadgeAction => {
  switch ((outcome ?? '').toLowerCase()) {
    case RmsConnectorRunOutcomes.Ok:
      return 'success';
    case RmsConnectorRunOutcomes.Failed:
      return 'error';
    case RmsConnectorRunOutcomes.RateLimited:
    case RmsConnectorRunOutcomes.Rejected:
      return 'warning';
    default:
      return 'muted';
  }
};

/** A connector is shown as ready, enabled-but-blocked, or off; the server's own flags decide. */
export const connectorStateAction = (connector: Pick<RecordDeploymentConnectorData, 'IsEnabled' | 'IsReadyToRun'>): BadgeAction => {
  if (connector.IsReadyToRun) return 'success';
  return connector.IsEnabled ? 'warning' : 'muted';
};

/** Translation key for a connector's state badge. */
export const connectorStateKey = (connector: Pick<RecordDeploymentConnectorData, 'IsEnabled' | 'IsReadyToRun'>): string =>
  connector.IsReadyToRun ? 'records.connector_ready' : connector.IsEnabled ? 'records.connector_not_ready' : 'records.connector_disabled';

/** Reconciliation items for one order, in the order the server listed them. */
export const reconciliationFor = (items: RecordDeploymentReconciliationData[], orderId: string | null | undefined): RecordDeploymentReconciliationData[] =>
  orderId ? items.filter((item) => item.OrderId === orderId) : [];

/** Open items per key (order id or connector id), for the count shown beside a row. */
export const countBy = (items: RecordDeploymentReconciliationData[], key: 'OrderId' | 'ConnectorId'): Record<string, number> =>
  items.reduce<Record<string, number>>((counts, item) => {
    const id = item[key];
    if (id) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});

/** Orders not yet closed out (the count on the Records home). */
export const openDeploymentCount = (deployments: RecordDeploymentData[]): number => deployments.filter((deployment) => deployment.Status !== 'ClosedOut').length;

/** Newest first by modification, so the deployment that just changed is at the top. */
export const sortDeployments = (deployments: RecordDeploymentData[]): RecordDeploymentData[] =>
  [...deployments].sort((a, b) => (b.ModifiedOn ?? '').localeCompare(a.ModifiedOn ?? '') || a.OrderNumber.localeCompare(b.OrderNumber));

/** A stable key for a reconciliation row (the server sends no id). */
export const reconciliationKey = (item: RecordDeploymentReconciliationData, index: number): string => `${item.ConnectorId ?? ''}-${item.OrderId}-${item.Kind}-${item.RequestNumber ?? index}`;
