import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText } from '@resgrid/ui';
import React from 'react';

import { statusAction } from '../lib/certification-format';

export interface CertificationStatusBadgeProps {
  status: number;
  testID?: string;
}

/** The department's status for a record (Active, Awaiting verification, Expired…) as a coloured badge. */
export const CertificationStatusBadge: React.FC<CertificationStatusBadgeProps> = ({ status, testID }) => {
  const { t } = useTranslation();
  return (
    <Badge action={statusAction(status)} size="md" className="rounded-full" testID={testID}>
      <BadgeText>{t(`certifications.status.${status}`)}</BadgeText>
    </Badge>
  );
};
