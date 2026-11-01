import { useHeaderActions } from '@resgrid/app-shell';
import { DashboardHeaderActions, DashboardScreen, useGridConfig } from '@resgrid/features/dashboard';
import React, { useMemo } from 'react';

/** BigBoard's home: the widget board, with its Edit / Configure / Add controls in the shell's app bar. */
export default function DashboardRoute() {
  const { numColumns } = useGridConfig();
  const actions = useMemo(() => <DashboardHeaderActions numColumns={numColumns} />, [numColumns]);
  useHeaderActions(actions);
  return <DashboardScreen showToolbar={false} />;
}
