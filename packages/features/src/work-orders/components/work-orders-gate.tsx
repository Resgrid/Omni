import { FeatureFlagKeys, useFeatureFlagStatus } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { Loading } from '@resgrid/ui';
import { type Href, Redirect } from 'expo-router';
import React from 'react';

export interface WorkOrdersGateProps {
  children: React.ReactNode;
  /** Where a disabled work-order route goes; defaults to the variant's home route. */
  homeHref?: string;
}

const variantHome = (): string => {
  try {
    return getActiveVariant().shell.homeRoute;
  } catch {
    return '/';
  }
};

/**
 * Wraps every work-order route: renders only when the department has `Maintenance.WorkOrders` (unknown flags are
 * disabled), waits while flags load, and sends a push or deep link home when the module is off (Responder).
 * Reading orders never needs Readiness Pro; reporting and working them does (checked per screen).
 */
export const WorkOrdersGate: React.FC<WorkOrdersGateProps> = ({ children, homeHref }) => {
  const status = useFeatureFlagStatus(FeatureFlagKeys.MaintenanceWorkOrders);
  if (status === 'unknown') return <Loading testID="work-orders-gate-loading" />;
  if (status === 'disabled') return <Redirect href={(homeHref ?? variantHome()) as Href} />;
  return <>{children}</>;
};
