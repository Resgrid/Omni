import { ArrowLeftIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '../pressable';
import { useThemeColors } from '../theme/use-theme-colors';
import { useTranslation } from '../utils/i18n';

export interface HeaderBackButtonProps {
  onPress: () => void;
  /** Overrides the theme icon colour (e.g. over a dark app bar). */
  color?: string;
  testID?: string;
}

// Fixed 40x40 plain View wrapper: iOS 26 liquid glass headers stretch flexible-width
// header subviews (react-native-screens 4.16). Gluestack/NativeWind styles can land a
// frame after the first native commit, so the glass capsule caches a stretched
// constraint on re-entry — the wrapper guarantees a fixed frame from the first commit.
// collapsable={false} keeps the native view (and its frame) from being optimized away.
// The Pressable fills the wrapper from the stylesheet too: NativeWind's rem is 14px, so a
// `size-10` class comes out at 35pt and leaves the icon off-centre in the glass.
export const HeaderBackButton: React.FC<HeaderBackButtonProps> = ({ onPress, color, testID = 'back-button' }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View style={styles.button} collapsable={false} testID={`${testID}-container`}>
      <Pressable onPress={onPress} testID={testID} style={styles.pressable} accessibilityRole="button" accessibilityLabel={t('common.back', { defaultValue: 'Back' })}>
        {/* lucide icons draw with `stroke="currentColor"`, which react-native-svg resolves
            to black — a `className` text colour never reaches a raw icon. Pass `color` instead,
            or the arrow is invisible against the dark header. */}
        <ArrowLeftIcon size={24} color={color ?? colors.icon} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
