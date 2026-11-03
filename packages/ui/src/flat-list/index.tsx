'use client';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import React from 'react';

export type { FlashListRef };

// FlashList v2 turns maintainVisibleContentPosition on by default, which keeps the first visible row anchored when data
// changes: on a searched or filtered list, clearing the filter leaves the rows that come back scrolled out of view above it.
// Off unless a screen asks for it (chat passes its own config), matching React Native's FlatList.
const MAINTAIN_POSITION_OFF = { disabled: true };

export function FlatList<T>({ maintainVisibleContentPosition = MAINTAIN_POSITION_OFF, ...props }: FlashListProps<T> & { ref?: React.Ref<FlashListRef<T>> }) {
  return <FlashList<T> {...props} maintainVisibleContentPosition={maintainVisibleContentPosition} />;
}
