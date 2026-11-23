import * as NavigationBar from 'expo-navigation-bar';
import { useIsFocused } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as React from 'react';
import { Platform, StatusBar } from 'react-native';

import { useResolvedColorScheme } from './theme/color-scheme';

type Props = { hidden?: boolean };

/**
 * Provided by a layout whose header stays dark in both themes (the app shell's primary bar), so the
 * status bar drawn over it keeps light content instead of following the theme.
 */
export const StatusBarOverDarkHeaderContext = React.createContext(false);

export const FocusAwareStatusBar = ({ hidden = false }: Props) => {
  const isFocused = useIsFocused();
  const colorScheme = useResolvedColorScheme();
  const isOverDarkHeader = React.useContext(StatusBarOverDarkHeaderContext);
  // Light content (white icons) is for a dark surface: the dark theme, or the shell's dark header.
  const wantsLightContent = isOverDarkHeader || colorScheme === 'dark';

  React.useEffect(() => {
    // Early return if screen is not focused to prevent off-screen instances from overriding UI
    if (!isFocused) return;

    // Only call platform-specific methods when they are supported
    if (Platform.OS === 'android') {
      try {
        // Edge-to-edge draws the status bar transparent over the app already (React Native 0.88 removed
        // StatusBar.setBackgroundColor/setTranslucent). Hide navigation bar only on Android
        NavigationBar.setVisibilityAsync('hidden').catch(() => {
          // Silently handle errors if NavigationBar API is not available
        });

        // Set the system UI flags to hide navigation bar
        if (hidden) {
          StatusBar.setHidden(true, 'slide');
        } else {
          StatusBar.setHidden(false, 'slide');
        }

        // Adapt status bar content based on theme
        StatusBar.setBarStyle(wantsLightContent ? 'light-content' : 'dark-content');
      } catch {
        // Silently handle errors if StatusBar methods are not available
      }
    } else if (Platform.OS === 'ios') {
      try {
        // iOS-specific status bar configuration
        if (hidden) {
          StatusBar.setHidden(true, 'slide');
        } else {
          StatusBar.setHidden(false, 'slide');
        }

        // Set status bar style for iOS
        StatusBar.setBarStyle(wantsLightContent ? 'light-content' : 'dark-content');
      } catch {
        // Silently handle errors if StatusBar methods are not available
      }
    }
  }, [hidden, wantsLightContent, isFocused]);

  // Don't render anything on web
  if (Platform.OS === 'web') return null;

  // Only render the status bar when focused and on supported platforms ('light' means light content). Android is always
  // edge-to-edge; the navigation bar is hidden through expo-navigation-bar above.
  return isFocused && (Platform.OS === 'android' || Platform.OS === 'ios') ? <ExpoStatusBar style={wantsLightContent ? 'light' : 'dark'} hidden={hidden} /> : null;
};

/**
 * The app's status bar, following the app's own theme rather than the device's: dark icons over the light app bar,
 * light icons over the dark one. Mounted once at the root (the app shell's providers) so a theme chosen in Settings that
 * differs from the device's, or a development client's launcher, never leaves white icons on a light bar. A screen's
 * own `FocusAwareStatusBar` still overrides it while focused.
 */
export const ThemedStatusBar: React.FC = () => {
  const colorScheme = useResolvedColorScheme();

  return Platform.OS === 'web' ? null : <ExpoStatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
};
