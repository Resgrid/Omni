import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import CallFormScreen from './call-form';

/** Route screen for `/call/new` (`?correct=<localId>` corrects a rejected queued call). */
export default function CallNewScreen() {
  const { correct } = useLocalSearchParams<{ correct?: string | string[] }>();
  const localId = Array.isArray(correct) ? correct[0] : correct;
  return <CallFormScreen mode="create" correctLocalId={localId && isSafeRouteId(localId) ? localId : undefined} />;
}
