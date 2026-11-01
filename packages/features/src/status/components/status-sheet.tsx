import { useCapability } from '@resgrid/config';
import React from 'react';

import { PersonnelStatusSheet } from './personnel-status-sheet';
import { type StatusPickerTab } from './status-picker';
import { UnitStatusSheet } from './unit-status-sheet';

export interface StatusSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: StatusPickerTab;
  initialStatusId?: number | string | null;
  initialHoldConfirmed?: boolean;
}

/** "My status": the active unit's status where the variant's status subject is the unit (Unit, IC), else the member's own. */
export const StatusSheet: React.FC<StatusSheetProps> = ({ initialTab, ...props }) => {
  const { subject } = useCapability('status');
  return subject === 'unit' ? <UnitStatusSheet {...props} /> : <PersonnelStatusSheet {...props} {...(initialTab ? { initialTab } : {})} />;
};
