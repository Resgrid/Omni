import type { ShiftDayResultData } from '@resgrid/models';
import { CustomBottomSheet } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ShiftDayDetails } from './shift-day-details';

export interface ShiftDayDetailsSheetProps {
  /** The day picked from a list (a light copy: the sheet loads the roster and needs). */
  shiftDay: ShiftDayResultData | null;
  onClose: () => void;
}

/** A shift day in a sheet over the Shifts screen (the full-screen route is ShiftDayScreen). */
export const ShiftDayDetailsSheet: React.FC<ShiftDayDetailsSheetProps> = ({ shiftDay, onClose }) => (
  <CustomBottomSheet isOpen={shiftDay !== null} onClose={onClose} snapPoints={[90]} testID="shift-day-details-sheet">
    {shiftDay ? (
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ShiftDayDetails shiftDayId={shiftDay.ShiftDayId} fallback={shiftDay} />
      </ScrollView>
    ) : null}
  </CustomBottomSheet>
);

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  content: { paddingBottom: 40 },
});
