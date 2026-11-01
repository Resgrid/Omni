// @resgrid/ui — the one design system for all five apps (omni-plan §7.9). Layer L5: imports only
// @resgrid/config, @resgrid/core and @resgrid/i18n among workspace packages.
//
// Barrel semantics follow Responder: `Pressable`, `Button`, `Text`, `Input`… are the gluestack
// primitives (in Unit/IC/Dispatch/BigBoard the same import was React Native's Pressable). Every
// primitive is also importable on its own subpath, e.g. `@resgrid/ui/button`.
//
// Not re-exported here (name clashes): the gluestack icon set (`@resgrid/ui/icon`) and the themed lucide
// icons (`@resgrid/ui/lucide-icons`) — both define CheckIcon, ChevronDownIcon, EyeIcon…; import them from
// their subpaths.
import { styled } from 'nativewind';
import Svg from 'react-native-svg';

// ─── gluestack primitives ───────────────────────────────────────────
export * from './accordion';
export * from './actionsheet';
export * from './alert';
export * from './alert-dialog';
export * from './avatar';
export * from './badge';
export * from './box';
export * from './button';
export * from './card';
export * from './center';
export * from './checkbox';
export * from './divider';
export * from './drawer';
export * from './fab';
export * from './flat-list';
export * from './form-control';
export * from './gluestack-image';
export { GluestackUIProvider } from './gluestack-ui-provider';
export * from './grid';
export * from './heading';
export * from './hstack';
export { createIcon, Icon } from './icon';
export * from './image';
export * from './image-background';
export * from './input';
export * from './input-accessory-view';
export * from './keyboard-avoiding-view';
export * from './link';
export * from './menu';
export * from './modal';
export * from './popover';
export * from './portal';
export * from './pressable';
export * from './progress';
export * from './radio';
export * from './refresh-control';
export * from './safe-area-view';
export * from './scroll-view';
export * from './section-list';
export * from './select';
export * from './skeleton';
export * from './slider';
export * from './spinner';
export * from './status-bar';
export * from './switch';
export * from './text';
export * from './textarea';
export * from './tooltip';
export * from './view';
export * from './virtualized-list';
export * from './vstack';

// ─── Resgrid components ─────────────────────────────────────────────
export * from './bottom-sheet';
export * from './common';
export * from './cover';
export * from './focus-aware-status-bar';
export * from './html-renderer';
export {
  computeFormFactor,
  detectElectron,
  FORM_FACTOR_BREAKPOINTS,
  type FormFactor,
  type FormFactorInfo,
  type FormFactorOptions,
  FormFactorProvider,
  pickResponsive,
  Responsive,
  type ResponsiveValues,
  useFormFactor,
  useResponsiveValue,
} from './layout';
export * from './list';
export * from './native-modal';
export * from './progress-bar';
export * from './shared-tabs';
export * from './side-drawer';
export * from './text-field-metrics';
export * from './theme';
export * from './toast';
export * from './utils';

// ─── React Native base components (Responder barrel) ─────────────────
export { ActivityIndicator, TouchableOpacity } from 'react-native';

/** Svg with className resolved into style (NativeWind v5 styled wrapper). */
export const StyledSvg = styled(Svg, {
  className: {
    target: 'style',
  },
});
