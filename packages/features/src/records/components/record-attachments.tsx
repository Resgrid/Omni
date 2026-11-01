import { logger } from '@resgrid/core/logging/logger';
import { useTranslation } from '@resgrid/i18n';
import type { RecordAttachmentData } from '@resgrid/models';
import { Badge, BadgeText, Divider, Heading, Pressable, Spinner, Text } from '@resgrid/ui';
import { MapPin, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteRecordAttachment, fetchRecordAttachments } from '../lib/records-api';

// A record's attachments (RMS plan RMS-1D). What happened to a photo's location metadata is shown on the attachment,
// not implied. TODO(data): capture (camera / library / file) needs the resumable upload session (BeginUpload →
// UploadChunk → CompleteUpload with a SHA-256 of the bytes) in @resgrid/data; this build lists and removes only.

export interface RecordAttachmentsProps {
  recordId: string;
  /** From the catalog entry; false hides the panel rather than failing at upload. */
  allowAttachments: boolean;
  readOnly?: boolean;
}

export const RecordAttachments: React.FC<RecordAttachmentsProps> = ({ recordId, allowAttachments, readOnly = false }) => {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<RecordAttachmentData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setAttachments(await fetchRecordAttachments(recordId));
    } catch (error) {
      logger.warn({ message: 'Record attachments could not be listed', context: { error: error instanceof Error ? error.message : 'unknown' } });
    } finally {
      setIsLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (allowAttachments) void load();
  }, [allowAttachments, load]);

  const remove = useCallback(
    async (attachmentId: string) => {
      setFailed(false);
      try {
        await deleteRecordAttachment(recordId, attachmentId);
        await load();
      } catch {
        setFailed(true);
      }
    },
    [recordId, load]
  );

  if (!allowAttachments) return null;

  return (
    <View className="mt-4 rounded-md border border-outline-200 p-3" testID="record-attachments">
      <View style={styles.header}>
        <Heading size="xs" accessibilityRole="header">
          {t('records.attachments')}
        </Heading>
        {isLoading ? <Spinner size="small" /> : null}
      </View>
      {failed ? (
        <Text size="sm" className="mt-2 text-error-600" accessibilityRole="alert">
          {t('records.attachment_failed')}
        </Text>
      ) : null}
      {attachments.length === 0 && !isLoading ? (
        <Text size="sm" className="mt-2 text-typography-500">
          {t('records.no_attachments')}
        </Text>
      ) : null}
      {attachments.map((attachment, index) => {
        const id = attachment.AttachmentId ?? `attachment-${index}`;
        return (
          <View key={id}>
            <View style={styles.row}>
              <View style={styles.body}>
                <Text size="sm" className="font-medium text-typography-900" numberOfLines={1}>
                  {attachment.FileName ?? t('records.untitled')}
                </Text>
                {attachment.MediaLocationRetained ? (
                  <Badge action="warning" size="sm" className="mt-1 self-start">
                    <View style={styles.badgeIcon}>
                      <MapPin size={11} color="#b45309" />
                    </View>
                    <BadgeText>{t('records.location_kept')}</BadgeText>
                  </Badge>
                ) : attachment.MetadataStripped ? (
                  <Badge action="muted" size="sm" className="mt-1 self-start">
                    <BadgeText>{t('records.location_removed')}</BadgeText>
                  </Badge>
                ) : null}
              </View>
              {!readOnly && attachment.AttachmentId ? (
                <Pressable
                  onPress={() => void remove(attachment.AttachmentId as string)}
                  accessibilityRole="button"
                  accessibilityLabel={t('records.remove_attachment')}
                  className="p-2"
                  testID={`record-attachment-remove-${attachment.AttachmentId}`}
                >
                  <Trash2 size={16} color="#dc2626" />
                </Pressable>
              ) : null}
            </View>
            <Divider />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  body: { flex: 1 },
  badgeIcon: { marginRight: 4 },
});
