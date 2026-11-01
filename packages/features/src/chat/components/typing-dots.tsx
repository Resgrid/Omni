import { HStack } from '@resgrid/ui';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';

export interface TypingDotsProps {
  color?: string;
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** Three softly pulsing dots for "someone is typing" / "the assistant is thinking" rows (Responder). */
export const TypingDots: React.FC<TypingDotsProps> = ({ color = '#9ca3af' }) => {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: USE_NATIVE_DRIVER }),
        ])
      )
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  const dotStyle = StyleSheet.flatten([styles.dot, { backgroundColor: color }]);
  return (
    <HStack space="xs" className="items-center">
      {dots.map((dot, index) => (
        <Animated.View key={index} style={{ ...dotStyle, opacity: dot }} />
      ))}
    </HStack>
  );
};

const styles = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3 },
});
