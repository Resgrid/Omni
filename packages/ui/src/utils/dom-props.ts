import type React from 'react';
import { StyleSheet } from 'react-native';

type WithTestID = { testID?: string };

/** React Native's press handler (`Text` takes one); a span or div has no such event. */
type WithPress = { onPress?: (event: React.SyntheticEvent<HTMLElement>) => void };

export type DomProps<T> = Omit<T, 'testID'> & { 'data-testid'?: string };

// React Native-only props that must never reach a DOM element. React warns
// ("React does not recognize the X prop on a DOM element") when these leak
// through the web wrappers that spread props onto raw elements. The accessibility*
// props are not dropped silently: they are mapped onto their aria-* / role equivalents first.
const RN_ONLY_PROPS = new Set([
  'testID',
  'numberOfLines',
  'ellipsizeMode',
  'adjustsFontSizeToFit',
  'allowFontScaling',
  'maxFontSizeMultiplier',
  'minimumFontScale',
  'suppressHighlighting',
  'selectable',
  'selectionColor',
  'textBreakStrategy',
  'lineBreakStrategyIOS',
  'dataDetectorType',
  'onTextLayout',
  'onLayout',
  // Press-in/out and long press have no DOM counterpart (onPress becomes a click, see pressDomProps).
  'onLongPress',
  'onPressIn',
  'onPressOut',
  'nativeID',
  'hitSlop',
  'collapsable',
  'needsOffscreenAlphaCompositing',
  'accessible',
  'accessibilityRole',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityElementsHidden',
  'accessibilityViewIsModal',
  'accessibilityIgnoresInvertColors',
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onAccessibilityEscape',
  'onMagicTap',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'onStartShouldSetResponder',
  'onStartShouldSetResponderCapture',
  'onMoveShouldSetResponder',
  'onMoveShouldSetResponderCapture',
  'onResponderGrant',
  'onResponderMove',
  'onResponderRelease',
  'onResponderReject',
  'onResponderTerminate',
  'onResponderTerminationRequest',
  'pointerEvents',
  'removeClippedSubviews',
  'renderToHardwareTextureAndroid',
  'shouldRasterizeIOS',
  'focusable',
  'tvParallaxProperties',
  'hasTVPreferredFocus',
]);

// accessibilityRole values whose ARIA role differs from (or does not exist under) the same name.
const ROLE_MAP: Record<string, string | null> = {
  adjustable: 'slider',
  header: 'heading',
  image: 'img',
  imagebutton: 'button',
  keyboardkey: 'button',
  none: null,
  summary: 'region',
  text: null,
  togglebutton: 'button',
};

type AccessibilityState = { disabled?: boolean; selected?: boolean; checked?: boolean | 'mixed'; busy?: boolean; expanded?: boolean };

type AccessibilityValue = { min?: number; max?: number; now?: number; text?: string };

/** CSS that clamps text to `numberOfLines` lines — the web counterpart of React Native's `numberOfLines`. */
export function lineClampStyle(numberOfLines?: number | null): React.CSSProperties | undefined {
  if (!numberOfLines || numberOfLines < 1) {
    return undefined;
  }

  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: numberOfLines,
    overflow: 'hidden',
  };
}

/** Maps React Native accessibility* props onto the DOM's aria-* / role / id attributes. */
export function toAriaProps(props: Record<string, unknown>): Record<string, unknown> {
  const aria: Record<string, unknown> = {};
  const role = props.accessibilityRole;

  if (typeof role === 'string' && role.length > 0) {
    const mapped = Object.prototype.hasOwnProperty.call(ROLE_MAP, role) ? ROLE_MAP[role] : role;

    if (mapped) {
      aria.role = mapped;
    }

    if (role === 'header') {
      aria['aria-level'] = 2;
    }
  }

  if (typeof props.accessibilityLabel === 'string') {
    aria['aria-label'] = props.accessibilityLabel;
  }

  if (typeof props.accessibilityHint === 'string') {
    aria['aria-description'] = props.accessibilityHint;
  }

  if (typeof props.nativeID === 'string') {
    aria.id = props.nativeID;
  }

  if (props.accessibilityLiveRegion === 'polite' || props.accessibilityLiveRegion === 'assertive') {
    aria['aria-live'] = props.accessibilityLiveRegion;
  } else if (props.accessibilityLiveRegion === 'none') {
    aria['aria-live'] = 'off';
  }

  if (props.accessibilityElementsHidden === true || props.importantForAccessibility === 'no-hide-descendants') {
    aria['aria-hidden'] = true;
  }

  if (props.accessibilityViewIsModal === true) {
    aria['aria-modal'] = true;
  }

  const state = props.accessibilityState as AccessibilityState | undefined;

  if (state && typeof state === 'object') {
    if (state.disabled !== undefined) aria['aria-disabled'] = state.disabled;

    if (state.selected !== undefined) aria['aria-selected'] = state.selected;

    if (state.checked !== undefined) aria['aria-checked'] = state.checked;

    if (state.busy !== undefined) aria['aria-busy'] = state.busy;

    if (state.expanded !== undefined) aria['aria-expanded'] = state.expanded;
  }

  const value = props.accessibilityValue as AccessibilityValue | undefined;

  if (value && typeof value === 'object') {
    if (value.min !== undefined) aria['aria-valuemin'] = value.min;

    if (value.max !== undefined) aria['aria-valuemax'] = value.max;

    if (value.now !== undefined) aria['aria-valuenow'] = value.now;

    if (value.text !== undefined) aria['aria-valuetext'] = value.text;
  }

  return aria;
}

/**
 * A React Native `lineHeight` is in pixels, but React DOM writes a bare number as a multiple of the font size
 * (`lineHeight: 14` → 14 lines tall), so a numeric one becomes `14px`.
 */
export function withPixelLineHeight(style: React.CSSProperties): React.CSSProperties {
  return Number.isFinite(style.lineHeight) ? { ...style, lineHeight: `${Number(style.lineHeight)}px` } : style;
}

/** The DOM props a press reads (state, a caller's own role, tab stop and handlers) and sets on a span or div. */
interface PressDomTarget {
  disabled?: unknown;
  'aria-disabled'?: unknown;
  role?: unknown;
  tabIndex?: unknown;
  onClick?: unknown;
  onKeyDown?: unknown;
  style?: unknown;
}

/**
 * What a React Native `onPress` becomes on a span or div: a click, a pointer cursor, a tab stop, and Enter (Space too
 * unless it is a link) from the keyboard, as a button or link would have. None of it while disabled (`disabled`, or
 * `aria-disabled` as `true` or `"true"`). A web-only `onClick` the caller gave wins; a caller's `onKeyDown` runs first and
 * the key still presses unless it called `preventDefault()`, as on a native button.
 */
function pressDomProps(onPress: NonNullable<WithPress['onPress']>, domProps: PressDomTarget): PressDomTarget {
  if (domProps.disabled === true || domProps['aria-disabled'] === true || domProps['aria-disabled'] === 'true') {
    return {};
  }

  const role = domProps.role ?? 'button';
  // SAFETY: the web wrappers type `onKeyDown` as their element's own React keyboard handler.
  const callerKeyDown = domProps.onKeyDown as ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined;

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    callerKeyDown?.(event);

    if (event.defaultPrevented) return;

    if (event.key === 'Enter' || (event.key === ' ' && role !== 'link')) {
      // Space would otherwise scroll the page.
      event.preventDefault();
      onPress(event);
    }
  };

  return {
    role,
    tabIndex: domProps.tabIndex ?? 0,
    onClick: domProps.onClick ?? onPress,
    onKeyDown,
    // SAFETY: an array style was flattened into one object above, and a web wrapper takes a style object.
    style: { cursor: 'pointer', ...((domProps.style as React.CSSProperties | undefined) ?? {}) },
  };
}

/**
 * Converts React Native props into valid DOM props for the web wrappers (`index.web.tsx`):
 * - `testID` → `data-testid`;
 * - accessibility* / `nativeID` → aria-* / `role` / `id` (explicit aria-* and `role` props win);
 * - `onPress` → a click and keyboard activation on a focusable element (`pressDomProps`);
 * - `numberOfLines` → a CSS line clamp merged into `style`;
 * - a numeric `lineHeight` → pixels (`withPixelLineHeight`);
 * - style arrays are flattened (a DOM element only takes one object — an array makes React set
 *   style[0] on the CSSStyleDeclaration, which throws and takes the whole screen down);
 * - every other React Native-only prop is dropped so React does not warn about it.
 */
export function toDomProps<T extends object>(props: T & WithTestID & WithPress): DomProps<T> {
  const { testID, onPress, ...rest } = props as T & WithTestID & WithPress & Record<string, unknown>;
  const domProps: Record<string, unknown> = { ...toAriaProps(rest) };

  for (const [key, value] of Object.entries(rest)) {
    if (!RN_ONLY_PROPS.has(key)) {
      domProps[key] = key === 'style' && Array.isArray(value) ? StyleSheet.flatten(value) : value;
    }
  }

  if (domProps.style) {
    // SAFETY: the web wrappers take a React Native or CSS style object here (an array was flattened above).
    domProps.style = withPixelLineHeight(domProps.style as React.CSSProperties);
  }

  const clamp = lineClampStyle(rest.numberOfLines as number | undefined);

  if (clamp) {
    domProps.style = { ...clamp, ...((domProps.style as React.CSSProperties | undefined) ?? {}) };
  }

  // A raw element has no pointerEvents prop; 'none'/'auto' carry over as CSS (box-* have no CSS equivalent).
  if (rest.pointerEvents === 'none' || rest.pointerEvents === 'auto') {
    domProps.style = { pointerEvents: rest.pointerEvents, ...((domProps.style as React.CSSProperties | undefined) ?? {}) };
  }

  if (onPress) {
    Object.assign(domProps, pressDomProps(onPress, domProps));
  }

  if (testID) {
    domProps['data-testid'] = testID;
  }

  return domProps as DomProps<T>;
}
