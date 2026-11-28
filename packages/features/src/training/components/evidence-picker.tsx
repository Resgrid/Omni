import { PhotoFormatError, PhotoPermissionError } from '@resgrid/features/certifications/lib/capture-photo';
import { formatFileSize } from '@resgrid/features/contacts/components/contact-files-panel';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, Pressable, showToast, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { Camera, FilePlus, ImagePlus, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';

import { type EvidenceFile, EvidenceTypeError, pickEvidenceDocument, pickEvidencePhoto } from '../lib/evidence';

export interface EvidencePickerProps {
  files: readonly EvidenceFile[];
  onChange: (files: EvidenceFile[]) => void;
  /** Most files the target takes (5 for a CE/CPD submission, 1 for a file-request lesson). */
  max: number;
  /** What is wrong with the files (a translated message), shown under the list. */
  error?: string | null;
  testID: string;
}

/**
 * Evidence files for a CE/CPD submission, a reviewer's request or a file-request lesson: take a photo, choose one, or choose a file.
 * Photos (HEIC included) are converted on this device to JPEG without location or device data before they are added.
 */
export const EvidencePicker: React.FC<EvidencePickerProps> = ({ files, onChange, max, error, testID }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [isPicking, setIsPicking] = useState(false);
  // The files as they are now: a file removed while a pick or its conversion is pending stays removed.
  const latest = useRef(files);

  latest.current = files;

  const add = async (pick: () => Promise<EvidenceFile | null>) => {
    if (files.length >= max) {
      showToast('error', t(max === 1 ? 'training.submit.one_file' : 'training.submit.too_many_files'));

      return;
    }

    setIsPicking(true);

    try {
      const file = await pick();

      if (file) onChange([...latest.current, file]);
    } catch (problem) {
      const key =
        problem instanceof PhotoPermissionError
          ? 'training.submit.photo_permission'
          : problem instanceof PhotoFormatError
            ? 'training.submit.photo_format'
            : problem instanceof EvidenceTypeError
              ? 'training.submit.file_type'
              : 'training.submit.file_invalid';

      showToast('error', t(key));
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <VStack space="sm" testID={testID}>
      {files.map((file) => (
        <HStack key={file.id} space="sm" className="items-center rounded-lg border border-outline-200 p-2" testID={`${testID}-file-${file.name}`}>
          <Text size="sm" className="flex-1 text-typography-900">{`${file.name} · ${formatFileSize(file.bytes)}`}</Text>
          <Pressable
            onPress={() => onChange(files.filter((item) => item.id !== file.id))}
            accessibilityRole="button"
            accessibilityLabel={t('training.submit.remove_file', { name: file.name })}
            testID={`${testID}-remove-${file.id}`}
          >
            <View>
              <X size={18} color={colors.icon} />
            </View>
          </Pressable>
        </HStack>
      ))}
      {error ? (
        <Text size="sm" className="text-error-600" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <HStack space="sm">
        <Button variant="outline" className="flex-1" onPress={() => void add(() => pickEvidencePhoto('camera'))} isDisabled={isPicking} testID={`${testID}-camera`}>
          <View>
            <Camera size={16} color={colors.primary} />
          </View>
          <ButtonText>{t('training.submit.take_photo')}</ButtonText>
        </Button>
        <Button variant="outline" className="flex-1" onPress={() => void add(() => pickEvidencePhoto('library'))} isDisabled={isPicking} testID={`${testID}-library`}>
          <View>
            <ImagePlus size={16} color={colors.primary} />
          </View>
          <ButtonText>{t('training.submit.choose_photo')}</ButtonText>
        </Button>
      </HStack>
      <Button variant="outline" onPress={() => void add(pickEvidenceDocument)} isDisabled={isPicking} testID={`${testID}-document`}>
        <View>
          <FilePlus size={16} color={colors.primary} />
        </View>
        <ButtonText>{t('training.submit.choose_file')}</ButtonText>
      </Button>
    </VStack>
  );
};
