import { type Href, Redirect } from 'expo-router';
import React from 'react';

/** Offline map packs are iOS/Android only (MapLibre plan §19.8): on the web and Electron the route goes back to Settings. */
export default function OfflineMapsUnavailable() {
  return <Redirect href={'/settings' as Href} />;
}
