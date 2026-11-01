import { useActiveVariant } from '@resgrid/config';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Temporary home until the variant's real home screen is ported (Phase 4). Shows only the app name. */
export function HomePlaceholder() {
  const variant = useActiveVariant();
  return (
    <View style={styles.container} testID="home-placeholder">
      <Text style={styles.title} accessibilityRole="header">
        {variant.identity.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
});
