import { ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, type LucideIcon, Merge, Navigation, RotateCw, Split, Undo2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { type ManeuverIconKey, maneuverIconKey } from '../engine/maneuver';

const ICONS: Record<ManeuverIconKey, LucideIcon> = {
  depart: Navigation,
  arrive: Flag,
  straight: ArrowUp,
  'slight-left': ArrowUpLeft,
  left: CornerUpLeft,
  'sharp-left': ArrowDownLeft,
  'slight-right': ArrowUpRight,
  right: CornerUpRight,
  'sharp-right': ArrowDownRight,
  uturn: Undo2,
  merge: Merge,
  'fork-left': Split,
  'fork-right': Split,
  roundabout: RotateCw,
  'ramp-left': ArrowUpLeft,
  'ramp-right': ArrowUpRight,
};

export interface ManeuverIconProps {
  type: string;
  modifier: string | null;
  size?: number;
  color?: string;
  testID?: string;
}

/** The maneuver's arrow (OSRM type + modifier); wrapped in a View because lucide icons take no style on web. */
export const ManeuverIcon: React.FC<ManeuverIconProps> = ({ type, modifier, size = 40, color = '#ffffff', testID }) => {
  const key = maneuverIconKey(type, modifier);
  const Icon = ICONS[key];
  return (
    <View testID={testID ?? `maneuver-icon-${key}`} accessibilityElementsHidden={true} importantForAccessibility="no">
      <Icon size={size} color={color} />
    </View>
  );
};
