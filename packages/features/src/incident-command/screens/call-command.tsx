import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useTranslation } from '@resgrid/i18n';
import { ScreenHeader, ScrollView, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Network } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { IncidentCommandTab } from '../components/incident-command-tab';
import type { IncidentCommandTier } from '../lib/permissions';

export interface CallCommandScreenProps {
  callId?: string;
  tier?: IncidentCommandTier;
}

/**
 * Full-screen board for one call (`/call/[id]/command`, Dispatch): the call tab's content with room for the lane
 * columns on desktop and Electron. Any tier works (IC can deep-link here too).
 */
export default function CallCommandScreen({ callId: callIdProp, tier }: CallCommandScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = callIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const callId = isSafeRouteId(raw) ? raw : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace((callId ? `/call/${encodeURIComponent(callId)}` : '/calls') as never));

  return (
    <View className="flex-1 bg-background-50" testID="call-command-screen">
      <ScreenHeader title={t('incident_command.tab_title')} onBack={back} />
      {callId ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <IncidentCommandTab callId={callId} tier={tier} fullScreen />
        </ScrollView>
      ) : (
        <ZeroState icon={Network} heading={t('incident_command.not_found')} isError testID="call-command-invalid" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
});
