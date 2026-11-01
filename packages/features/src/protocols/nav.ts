import { BookOpen } from 'lucide-react-native';
import type { ComponentType } from 'react';

/** Structural nav registry entry (same shape as calls' `FeatureNavEntry`; the app-shell registry type replaces both). */
export interface ProtocolsNavEntry {
  id: string;
  route: string;
  titleKey: string;
  icon: ComponentType<{ size?: number; color?: string }>;
}

/** Nav registry entry (placement per variant is the app shell's decision). */
export const protocolsNav: readonly ProtocolsNavEntry[] = [{ id: 'protocols', route: 'protocols', titleKey: 'protocols.title', icon: BookOpen }];
