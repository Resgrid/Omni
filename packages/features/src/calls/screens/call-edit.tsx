import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useTranslation } from '@resgrid/i18n';
import { ZeroState } from '@resgrid/ui';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import CallFormScreen from './call-form';

/** Route screen for `/call/[id]/edit`. */
export default function CallEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const callId = Array.isArray(id) ? id[0] : id;
  if (!callId || !isSafeRouteId(callId)) return <ZeroState isError heading={t('call_detail.not_found')} testID="call-edit-invalid" />;
  return <CallFormScreen mode="edit" callId={callId} />;
}
