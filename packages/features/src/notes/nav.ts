import { StickyNote } from 'lucide-react-native';
import type { ComponentType } from 'react';

/** Structural nav registry entry (same shape as calls' `FeatureNavEntry`; the app-shell registry type replaces both). */
export interface NotesNavEntry {
  id: string;
  route: string;
  titleKey: string;
  termKey?: string;
  icon: ComponentType<{ size?: number; color?: string }>;
}

/** Department notes; `module.notes` lets a department rename the module. */
export const notesNav: readonly NotesNavEntry[] = [{ id: 'notes', route: 'notes', titleKey: 'notes.title', termKey: 'module.notes', icon: StickyNote }];
