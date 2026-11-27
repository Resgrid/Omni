import { useCapability } from '@resgrid/config';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { downloadProtocolAttachment, downloadProtocolVersionFile, selectOwedAcknowledgment, useProtocolAcknowledgmentsStore, useProtocolsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { ProtocolVersionContentData } from '@resgrid/models';
import { Button, ButtonText, HStack, Loading, ScreenHeader, ScrollView, Text, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen, CloudOff, ExternalLink, ListChecks, Paperclip } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { AcknowledgmentPanel } from '../components/acknowledgment-panel';
import { FileList } from '../components/file-list';
import { ProtocolContent } from '../components/protocol-content';
import { documentFile, groupSteps, isDocumentVersion, protocolDisplayHtml, protocolKindKey } from '../lib/protocol-library';
import { protocolRoutes } from '../routes';

export interface ProtocolDetailScreenProps {
  protocolId?: string;
}

const NO_STEPS: NonNullable<ProtocolVersionContentData['Steps']> = [];

/** Only an https link opens from server data (the dosing tool the department configured). */
const isHttpsLink = (url: string | null | undefined): url is string => !!url && /^https:\/\//i.test(url);

/**
 * A protocol at `/protocols/[id]`: code, kind and the version in force with its effective date (the version stamp), the text
 * in the reader's language where the department approved a translation, its steps, its attachments and, for a
 * document-backed version, the document. Where the app has `protocols.acknowledgments` and the member owes a read-and-sign,
 * the version they owe is the one shown, with the sign (and quiz) panel. The persisted copy shows at once and offline.
 */
export default function ProtocolDetailScreen({ protocolId: protocolIdProp }: ProtocolDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const { acknowledgments: hasAcknowledgments } = useCapability('protocols');
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = protocolIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const protocolId = isSafeRouteId(rawId) ? rawId : null;
  const protocol = useProtocolsStore((state) => (protocolId ? (state.protocolDetailsById[protocolId] ?? state.protocols.find((item) => item.Id === protocolId)) : undefined));
  const entry = useProtocolsStore((state) => (protocolId ? state.libraryById[protocolId] : undefined));
  const isLoading = useProtocolsStore((state) => state.loading.detail === true);
  const acknowledgments = useProtocolAcknowledgmentsStore((state) => state.acknowledgments);
  const owed = useMemo(() => (hasAcknowledgments ? selectOwedAcknowledgment(acknowledgments, protocolId) : null), [acknowledgments, hasAcknowledgments, protocolId]);
  // The version the member owes is the one they must read; otherwise the version in force.
  const versionId = owed ? String(owed.ProtocolVersionId) : (entry?.CurrentVersionId ?? null);
  const content = useProtocolsStore((state) => (versionId ? state.versionContentById[versionId] : undefined));
  const locale = i18n?.language;

  useEffect(() => {
    if (protocolId) void useProtocolsStore.getState().fetchProtocol(protocolId);
  }, [protocolId]);

  useEffect(() => {
    if (versionId) void useProtocolsStore.getState().fetchVersionContent(versionId, locale ? { locale } : undefined);
  }, [versionId, locale]);

  useEffect(() => {
    if (hasAcknowledgments) void useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments();
  }, [hasAcknowledgments]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(protocolRoutes.protocolList()));

  const reload = async () => {
    if (!protocolId) return;
    await useProtocolsStore.getState().fetchProtocol(protocolId, { bypassCache: true });
    const current = useProtocolsStore.getState().libraryById[protocolId]?.CurrentVersionId;

    if (current) await useProtocolsStore.getState().fetchVersionContent(current, { bypassCache: true, locale });
  };

  const downloadDocument = useCallback((id: string) => downloadProtocolVersionFile(id), []);

  if (!protocol) {
    return (
      <View className="flex-1 bg-background-50" testID="protocol-detail-screen">
        <ScreenHeader title={t('protocols.details.title')} onBack={back} />
        {isLoading && protocolId ? <Loading /> : <ZeroState icon={BookOpen} heading={t('protocols.not_found')} onRetry={protocolId ? reload : undefined} testID="protocol-detail-missing" />}
      </View>
    );
  }

  const updated = formatUtcInDepartmentTime(protocol.UpdatedOn || protocol.CreatedOn, timeZone);
  const effective = content?.EffectiveOn ?? entry?.EffectiveOn ?? null;
  const effectiveText = effective ? formatUtcInDepartmentTime(effective, timeZone, { dateStyle: 'medium' }) : '';
  const label = content?.Label ?? (owed ? owed.VersionLabel : entry?.VersionLabel) ?? null;
  const isDocument = isDocumentVersion(content, owed);
  const html = isDocument ? '' : protocolDisplayHtml(protocol, content);
  const steps = content?.Steps ?? NO_STEPS;

  const attachments = (entry?.Attachments ?? protocol.Attachments.map((attachment) => ({ ...attachment, Size: null }))).map((attachment) => ({
    id: attachment.Id,
    name: attachment.FileName,
    type: attachment.FileType,
    size: attachment.Size,
  }));

  const dosingUrl = content?.DosingToolUrl ?? null;
  const dosingLink = isHttpsLink(dosingUrl) ? dosingUrl : null;
  const translationMissing = !!content && content.IsFallback && !!locale && !!content.Locale && !locale.toLowerCase().startsWith(content.Locale.toLowerCase().slice(0, 2));

  return (
    <View className="flex-1 bg-background-50" testID="protocol-detail-screen">
      <ScreenHeader title={protocol.Name} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {owed ? <AcknowledgmentPanel acknowledgment={owed} contentHash={content?.ContentHash ?? null} testID="protocol-acknowledgment" /> : null}
        <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4">
          <HStack space="sm" className="mb-2 flex-wrap items-center" testID="protocol-version-stamp">
            <Text size="xs" className="text-typography-600">
              {[t(protocolKindKey(entry?.Kind)), entry?.Number, label ? t('protocols.version_label', { label }) : null, effectiveText ? t('protocols.effective_on', { date: effectiveText }) : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {content ? (
              <HStack space="xs" className="items-center" testID="protocol-offline-badge">
                <View>
                  <CloudOff size={12} color={colors.textMuted} />
                </View>
                <Text size="xs" className="text-typography-500">
                  {t('protocols.available_offline')}
                </Text>
              </HStack>
            ) : null}
          </HStack>
          {translationMissing ? (
            <Text size="xs" className="mb-2 text-typography-500" testID="protocol-translation-fallback">
              {t('protocols.translation_fallback')}
            </Text>
          ) : null}
          <ProtocolContent protocol={{ ...protocol, ProtocolText: html }} testID="protocol-detail" />
          {isDocument && versionId ? (
            <VStack space="sm" className="mt-3">
              <Text size="sm" className="text-typography-600">
                {t('protocols.document_version')}
              </Text>
              <FileList files={[documentFile(content, versionId, protocol.Code || protocol.Name)]} download={downloadDocument} testID="protocol-document" />
            </VStack>
          ) : null}
          {dosingLink ? (
            <Button variant="outline" className="mt-3" onPress={() => void Linking.openURL(dosingLink)} testID="protocol-dosing-tool">
              <View>
                <ExternalLink size={16} color={colors.primary} />
              </View>
              <ButtonText>{t('protocols.dosing_tool')}</ButtonText>
            </Button>
          ) : null}
          {updated ? (
            <Text size="xs" className="mt-3 text-typography-500">
              {`${t('protocols.details.updated')}: ${updated}`}
            </Text>
          ) : null}
        </View>
        {steps.length > 0 ? (
          <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID="protocol-steps">
            <HStack space="sm" className="mb-2 items-center">
              <View>
                <ListChecks size={18} color={colors.icon} />
              </View>
              <Text className="font-semibold text-typography-900" accessibilityRole="header">
                {t('protocols.steps.title')}
              </Text>
            </HStack>
            {groupSteps(steps).map((group, index) => (
              <VStack key={`${group.group ?? ''}-${index}`} space="xs" className="mb-2">
                {group.group ? <Text className="text-sm font-semibold text-typography-800">{group.group}</Text> : null}
                {group.steps.map((step, stepIndex) => (
                  <Text key={step.Id} size="sm" className="text-typography-700">{`${stepIndex + 1}. ${step.Text ?? ''}`}</Text>
                ))}
              </VStack>
            ))}
          </View>
        ) : null}
        {attachments.length > 0 ? (
          <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID="protocol-attachments">
            <HStack space="sm" className="mb-2 items-center">
              <View>
                <Paperclip size={18} color={colors.icon} />
              </View>
              <Text className="font-semibold text-typography-900" accessibilityRole="header">
                {t('protocols.files.title')}
              </Text>
            </HStack>
            <FileList files={attachments} download={downloadProtocolAttachment} testID="protocol-files" />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
});
