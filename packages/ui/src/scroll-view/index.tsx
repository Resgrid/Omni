'use client';
import React from 'react';
import { ScrollView as RNScrollView, type ScrollViewProps, StyleSheet } from 'react-native';

/**
 * React Native's ScrollView, except that a horizontal one (a chip, tab or filter row) keeps its content's height. React
 * Native gives every ScrollView flexGrow and flexShrink 1: above a list a chip row took half the screen and stretched
 * its chips to fill it, and above a full-height empty state it was squeezed to nothing. A `style` still wins, so a
 * horizontal scroller that sits in a row and must fit the width left passes `style={{ flexShrink: 1 }}`.
 */
export const ScrollView = React.forwardRef<React.ComponentRef<typeof RNScrollView>, ScrollViewProps>(({ horizontal, style, ...props }, ref) => (
  <RNScrollView ref={ref} horizontal={horizontal} style={horizontal ? StyleSheet.flatten([styles.horizontal, style]) : style} {...props} />
));

ScrollView.displayName = 'ScrollView';

const styles = StyleSheet.create({ horizontal: { flexGrow: 0, flexShrink: 0 } });
