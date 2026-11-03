import { Image, useResolvedColorScheme } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// The Resgrid wordmark every app shows above its sign-in title (the legacy apps' Resgrid_JustText images, 426×168).
const WORDMARK: number = require('../assets/resgrid-wordmark.png');
const WORDMARK_WHITE: number = require('../assets/resgrid-wordmark-white.png');

/**
 * The wordmark for the sign-in headers, white on a dark theme. Decorative: the heading beside it names the app, so it is
 * hidden from assistive technology. Plain React Native styles, which hold before the stylesheet on a cold web load.
 */
export function AuthLogo() {
  const scheme = useResolvedColorScheme();
  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="auth-logo">
      <Image source={scheme === 'dark' ? WORDMARK_WHITE : WORDMARK} placeholder={null} contentFit="contain" style={styles.image} testID={`auth-logo-${scheme}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', marginBottom: 8 },
  image: { width: 220, height: 87 },
});
