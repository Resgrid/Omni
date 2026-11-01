import type { ComponentType, ReactNode } from 'react';

/**
 * Overlay slots. Sheets and full-screen maps need the app's `NativeModal` / `CustomBottomSheet`, which live in
 * `@resgrid/ui` (layer L5) — above `@resgrid/maps` (L3). The app shell passes them in through `MapProvider`:
 *
 *   <MapProvider overlays={{ Modal: NativeModal, Sheet: CustomBottomSheet }} …>
 *
 * The prop shapes are the subset those components already accept. Without a slot the fallbacks render an absolutely
 * positioned view (never React Native's `Modal`, which AGENTS.md forbids).
 */

export interface MapModalSlotProps {
  visible: boolean;
  onRequestClose: () => void;
  animationType?: 'none' | 'slide' | 'fade';
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen';
  statusBarTranslucent?: boolean;
  testID?: string;
  children?: ReactNode;
}

export interface MapSheetSlotProps {
  isOpen: boolean;
  onClose: () => void;
  /** Percentages of the window height; the first sizes the sheet. */
  snapPoints?: number[];
  testID?: string;
  children: ReactNode;
}

export interface MapOverlaySlots {
  Modal?: ComponentType<MapModalSlotProps>;
  Sheet?: ComponentType<MapSheetSlotProps>;
}
