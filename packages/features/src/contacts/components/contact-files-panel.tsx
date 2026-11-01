import { logger } from '@resgrid/core/logging/logger';
import { useContactsStore } from '@resgrid/data';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type ContactFileResultData } from '@resgrid/models';
import { HStack, Pressable, Spinner, Text, useToast, VStack } from '@resgrid/ui';
import { FileIcon, FileImage, FileText } from 'lucide-react-native';
import React, { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';

const NO_FILES: ContactFileResultData[] = [];

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
};

const iconFor = (mime: string) => (mime.startsWith('image/') ? FileImage : mime.includes('pdf') || mime.startsWith('text/') ? FileText : FileIcon);

/**
 * Files attached to a contact (Dispatch files panel). Each row opens the server's signed, expiring https link (re-read
 * on every list call, never persisted). A protected file has no link without a grant and shows as protected.
 */
export const ContactFilesPanel: React.FC<{ contactId: string }> = ({ contactId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const files = useContactsStore((state) => state.filesByContact[contactId] ?? NO_FILES);
  const isLoading = useContactsStore((state) => state.loading.files === true);

  useEffect(() => {
    // Signed links expire: always re-read.
    void useContactsStore.getState().fetchFiles(contactId, { bypassCache: true });
  }, [contactId]);

  const open = useCallback(
    async (file: ContactFileResultData) => {
      if (!file.Url || !/^https:\/\//i.test(file.Url)) return;
      try {
        await Linking.openURL(file.Url);
      } catch (error) {
        logger.warn({ message: 'Could not open a contact file', context: { error: error instanceof Error ? error.message : 'unknown' } });
        toast.error(t('contacts.files.download_failed'));
      }
    },
    [t, toast]
  );

  if (isLoading && files.length === 0) return <Spinner testID="contact-files-loading" />;
  if (files.length === 0) return <Text className="py-4 text-center text-typography-500">{t('contacts.files.empty')}</Text>;

  return (
    <VStack space="sm" testID="contact-files-panel">
      {files.map((file) => {
        const Icon = iconFor(file.Mime ?? '');
        const isWithheld = (file.RedactedFields ?? []).length > 0 || file.Name === 'REDACTED';
        const canOpen = !!file.Url && !isWithheld;
        return (
          <Pressable
            key={file.Id}
            testID={`contact-file-${file.Id}`}
            onPress={canOpen ? () => void open(file) : undefined}
            disabled={!canOpen}
            accessibilityRole="button"
            className="rounded-lg border border-outline-200 bg-background-0 p-3"
          >
            <HStack space="md" className="items-center">
              <Icon size={20} color="#6b7280" />
              <VStack className="flex-1">
                {isWithheld ? <ProtectedLabel size="sm" /> : <Text className="text-sm font-medium text-typography-900">{file.Name || file.FileName}</Text>}
                <Text className="text-xs text-typography-500">{[file.TypeName, formatFileSize(file.Size)].filter((part) => !!part).join(' • ')}</Text>
              </VStack>
            </HStack>
          </Pressable>
        );
      })}
    </VStack>
  );
};
