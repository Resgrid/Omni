import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useProtocolsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { Loading, ScreenHeader, ScrollView, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { ProtocolContent } from '../components/protocol-content';
import { protocolRoutes } from '../routes';

export interface ProtocolDetailScreenProps {
  protocolId?: string;
}

/**
 * A protocol at `/protocols/[id]` (Unit baseline): code, description, sanitized text and updated date. Shows the
 * persisted copy at once (the list may carry a trimmed one) and the full text once the detail read lands.
 */
export default function ProtocolDetailScreen({ protocolId: protocolIdProp }: ProtocolDetailScreenProps) {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = protocolIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const protocolId = isSafeRouteId(rawId) ? rawId : null;
  const protocol = useProtocolsStore((state) => (protocolId ? (state.protocolDetailsById[protocolId] ?? state.protocols.find((item) => item.Id === protocolId)) : undefined));
  const isLoading = useProtocolsStore((state) => state.loading.detail === true);

  useEffect(() => {
    if (protocolId) void useProtocolsStore.getState().fetchProtocol(protocolId);
  }, [protocolId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(protocolRoutes.protocolList()));

  if (!protocol) {
    return (
      <View className="flex-1 bg-background-50" testID="protocol-detail-screen">
        <ScreenHeader title={t('protocols.details.title')} onBack={back} />
        {isLoading && protocolId ? <Loading /> : <ZeroState icon={BookOpen} heading={t('protocols.not_found')} testID="protocol-detail-missing" />}
      </View>
    );
  }

  const updated = formatUtcInDepartmentTime(protocol.UpdatedOn || protocol.CreatedOn, timeZone);

  return (
    <View className="flex-1 bg-background-50" testID="protocol-detail-screen">
      <ScreenHeader title={protocol.Name} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View className="rounded-xl border border-outline-200 bg-background-0 p-4">
          <ProtocolContent protocol={protocol} testID="protocol-detail" />
          {updated ? (
            <Text size="xs" className="mt-3 text-typography-500">
              {`${t('protocols.details.updated')}: ${updated}`}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
});
