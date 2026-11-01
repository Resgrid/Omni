import { useRecordDeploymentsStore } from '@resgrid/data';
import type { RecordDeploymentReconciliationData } from '@resgrid/models';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchDepartmentReconciliation } from '../lib/records-api';

export interface DepartmentReconciliation {
  items: RecordDeploymentReconciliationData[];
  isLoading: boolean;
  reload: () => Promise<void>;
}

/**
 * Open reconciliation across every connector, for department administrators only (the server refuses anyone else,
 * so non-admins never ask). Connectors come from the deployments store; their items are read here per connector.
 */
export function useDepartmentReconciliation(isAdmin: boolean): DepartmentReconciliation {
  const fetchConnectors = useRecordDeploymentsStore((state) => state.fetchConnectors);
  const [items, setItems] = useState<RecordDeploymentReconciliationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    if (!isAdmin) {
      setItems([]);
      return;
    }
    sequence.current += 1;
    const mine = sequence.current;
    setIsLoading(true);
    try {
      const connectors = await fetchConnectors();
      const next = await fetchDepartmentReconciliation(connectors.map((connector) => connector.Id));
      if (mine === sequence.current) setItems(next);
    } finally {
      if (mine === sequence.current) setIsLoading(false);
    }
  }, [isAdmin, fetchConnectors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, isLoading, reload };
}
