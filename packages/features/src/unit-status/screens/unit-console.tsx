import { ScrollView, View } from '@resgrid/ui';
import React from 'react';

import { UnitStatusPanel } from '../components/unit-status-panel';
import type { QuickActionId } from '../lib/quick-actions';

export interface UnitConsoleScreenProps {
  onClearActiveCall?: () => void;
  excludeQuickActions?: readonly QuickActionId[];
}

/**
 * The full-screen status console (`/console`): the Electron MDT home and the phone's way to the console outside the
 * drawer. Wide windows split into status buttons | unit, call and crew, with 64 px touch targets on an MDT.
 */
export default function UnitConsoleScreen({ onClearActiveCall, excludeQuickActions }: UnitConsoleScreenProps) {
  return (
    <View className="flex-1 bg-background-0" testID="unit-console-screen">
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <UnitStatusPanel layout="screen" onClearActiveCall={onClearActiveCall} excludeQuickActions={excludeQuickActions} />
      </ScrollView>
    </View>
  );
}
