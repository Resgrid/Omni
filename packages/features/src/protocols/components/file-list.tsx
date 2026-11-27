import type { BinaryResponse } from '@resgrid/api';
import { FileOpenerUnavailableError, openFile } from '@resgrid/core/device/file-opener';
import { logger } from '@resgrid/core/logging/logger';
import { formatFileSize } from '@resgrid/features/contacts/components/contact-files-panel';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Spinner, Text, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { FileIcon, FileImage, FileText } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

export interface DownloadableFile {
  id: string;
  name: string;
  type: string | null;
  size: number | null;
}

export interface FileListProps {
  files: readonly DownloadableFile[];
  /** Fetches the bytes (online only); the list hands them to the platform file opener. */
  download: (id: string) => Promise<BinaryResponse>;
  testID?: string;
}

const iconFor = (mime: string) => (mime.startsWith('image/') ? FileImage : mime.includes('pdf') || mime.startsWith('text/') ? FileText : FileIcon);

/**
 * Attachments of a protocol or a training: each row downloads the file through the authenticated API and opens it with the
 * device's viewer (native share/open sheet; a download on web and Electron). Nothing is kept on the device beyond the OS cache.
 */
export const FileList: React.FC<FileListProps> = ({ files, download, testID = 'file-list' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = useCallback(
    async (file: DownloadableFile) => {
      setBusyId(file.id);

      try {
        const { data, contentType } = await download(file.id);
        await openFile({ data, fileName: file.name, contentType: contentType ?? file.type });
      } catch (error) {
        logger.warn({ message: 'Could not open a file', context: { error: error instanceof Error ? error.name : 'unknown' } });
        toast.error(t(error instanceof FileOpenerUnavailableError ? 'protocols.files.open_unavailable' : 'protocols.files.open_failed'));
      } finally {
        setBusyId(null);
      }
    },
    [download, t, toast]
  );

  return (
    <VStack space="sm" testID={testID}>
      {files.map((file) => {
        const Icon = iconFor(file.type ?? '');
        const size = file.size ? formatFileSize(file.size) : '';

        return (
          <Pressable
            key={file.id}
            onPress={busyId ? undefined : () => void open(file)}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={t('protocols.files.open', { name: file.name })}
            testID={`${testID}-${file.id}`}
            className="rounded-lg border border-outline-200 bg-background-0 p-3"
          >
            <HStack space="md" className="items-center">
              <View>
                <Icon size={20} color={colors.icon} />
              </View>
              <VStack className="flex-1">
                <Text className="text-sm font-medium text-typography-900">{file.name}</Text>
                {size ? <Text className="text-xs text-typography-500">{size}</Text> : null}
              </VStack>
              {busyId === file.id ? <Spinner size="small" /> : null}
            </HStack>
          </Pressable>
        );
      })}
    </VStack>
  );
};
