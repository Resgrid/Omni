import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { CallFileKind, getDataLocationFix, type QueuedCallFile, useCallDetailStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallFileResultData } from '@resgrid/models';
import { Button, ButtonText, Image, Input, InputField, Pressable, Text, useToast } from '@resgrid/ui';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { CallModalFrame } from './call-modal-frame';
import { CallNotesPanel } from './call-notes-panel';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
}

/** The call's notes in a page sheet. */
export const CallNotesModal: React.FC<ModalProps> = ({ isOpen, onClose, callId }) => {
  const { t } = useTranslation();
  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('callNotes.title')} testID="call-notes-modal">
      <CallNotesPanel callId={callId} />
    </CallModalFrame>
  );
};

const EMPTY_QUEUED: QueuedCallFile[] = [];

const useQueuedFiles = (callId: string, type: number): QueuedCallFile[] => {
  const queuedFiles = useCallDetailStore((state) => state.queuedFiles);
  return useMemo(() => {
    const list = Object.values(queuedFiles).filter((file) => file.callId === callId && file.type === type);
    return list.length > 0 ? list : EMPTY_QUEUED;
  }, [callId, queuedFiles, type]);
};

const QueuedFileRow: React.FC<{ file: QueuedCallFile }> = ({ file }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.row} className="border-outline-100" testID={`queued-file-${file.localId}`}>
      <Text className="flex-1 text-typography-900">{file.name}</Text>
      <Text size="xs" className={file.state === 'rejected' ? 'font-semibold text-error-600' : 'font-semibold text-warning-700'}>
        {file.state === 'rejected' ? t('callNotes.rejected_marker') : t('callNotes.queued_marker')}
      </Text>
    </View>
  );
};

/**
 * Images on the call (R images modal UI): thumbnails, and add from the camera or gallery. Uploads are offline-capable
 * (outbox `calls.file.upload`): the picked image is staged and sent when the connection returns.
 */
export const CallImagesModal: React.FC<ModalProps> = ({ isOpen, onClose, callId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const images = useCallDetailStore((state) => state.details[callId]?.images ?? null);
  const fetchCallImages = useCallDetailStore((state) => state.fetchCallImages);
  const uploadCallFile = useCallDetailStore((state) => state.uploadCallFile);
  const queued = useQueuedFiles(callId, CallFileKind.Image);
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) void fetchCallImages(callId);
  }, [callId, fetchCallImages, isOpen]);

  const pick = async (source: 'camera' | 'gallery') => {
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: true };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const fix = getDataLocationFix();
      const outcome = await uploadCallFile({
        callId,
        type: CallFileKind.Image,
        name: name.trim() || asset.fileName || t('callImages.default_name'),
        data: asset.base64 ?? undefined,
        stagedUri: asset.base64 ? undefined : asset.uri,
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
      });
      setName('');
      if (outcome.outcome === 'queued') toast.info(t('callImages.queued'));
      else if (outcome.outcome === 'rejected') toast.error(t('callImages.upload_error'));
    } catch {
      toast.error(source === 'camera' ? t('callImages.error_capturing_image') : t('callImages.error_selecting_image'));
    }
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('callImages.title')} testID="call-images-modal">
      <View style={styles.panel}>
        <View style={styles.grid}>
          {(images ?? []).map((image) => (
            <ImageTile key={image.Id} image={image} />
          ))}
        </View>
        {queued.map((file) => (
          <QueuedFileRow key={file.localId} file={file} />
        ))}
        {images !== null && images.length === 0 && queued.length === 0 ? <Text className="py-4 text-center text-typography-500">{t('callImages.no_images')}</Text> : null}
        <Text size="sm" className="mb-1 mt-4 text-typography-600">
          {t('callImages.image_name')}
        </Text>
        <Input variant="outline">
          <InputField value={name} onChangeText={setName} placeholder={t('callImages.image_name')} accessibilityLabel={t('callImages.image_name')} />
        </Input>
        <View style={styles.actions}>
          <Button className="mr-2 flex-1" onPress={() => void pick('camera')} accessibilityLabel={t('callImages.take_photo')} testID="call-images-camera">
            <ButtonText>{t('callImages.take_photo')}</ButtonText>
          </Button>
          <Button variant="outline" className="flex-1" onPress={() => void pick('gallery')} accessibilityLabel={t('callImages.select_from_gallery')} testID="call-images-gallery">
            <ButtonText>{t('callImages.select_from_gallery')}</ButtonText>
          </Button>
        </View>
      </View>
    </CallModalFrame>
  );
};

const ImageTile: React.FC<{ image: CallFileResultData }> = ({ image }) => {
  const { t } = useTranslation();
  const uri = image.Url || (image.Data ? `data:${image.Mime || 'image/jpeg'};base64,${image.Data}` : '');
  return (
    <View style={styles.tile} testID={`call-image-${image.Id}`}>
      {uri ? <Image source={{ uri }} alt={image.Name || t('callImages.image_alt')} style={styles.thumb} /> : null}
      <Text size="xs" className="text-typography-600" numberOfLines={1}>
        {image.Name || t('callImages.default_name')}
      </Text>
    </View>
  );
};

/** Files on the call (R files modal UI): open via the signed link, add a document (offline-capable upload). */
export const CallFilesModal: React.FC<ModalProps> = ({ isOpen, onClose, callId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const files = useCallDetailStore((state) => state.details[callId]?.files ?? null);
  const fetchCallFiles = useCallDetailStore((state) => state.fetchCallFiles);
  const uploadCallFile = useCallDetailStore((state) => state.uploadCallFile);
  const queued = useQueuedFiles(callId, CallFileKind.File);

  useEffect(() => {
    if (isOpen) void fetchCallFiles(callId);
  }, [callId, fetchCallFiles, isOpen]);

  const addFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const outcome = await uploadCallFile({ callId, type: CallFileKind.File, name: asset.name, stagedUri: asset.uri });
      if (outcome.outcome === 'queued') toast.info(t('call_detail.files.queued'));
      else if (outcome.outcome === 'rejected') toast.error(t('call_detail.files.upload_error'));
    } catch {
      toast.error(t('call_detail.files.select_error'));
    }
  };

  const open = (file: CallFileResultData) => {
    if (!/^https:\/\//i.test(file.Url)) {
      toast.error(t('call_detail.files.open_error'));
      return;
    }
    Linking.openURL(file.Url).catch(() => toast.error(t('call_detail.files.open_error')));
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('call_detail.files.title')} testID="call-files-modal">
      <View style={styles.panel}>
        {(files ?? []).map((file) => (
          <Pressable key={file.Id} onPress={() => open(file)} accessibilityRole="link" accessibilityLabel={file.Name || file.FileName} style={styles.row} className="border-outline-100" testID={`call-file-${file.Id}`}>
            <View style={styles.fileBody}>
              <Text className="text-typography-900">{file.Name || file.FileName}</Text>
              <Text size="xs" className="text-typography-500">
                {formatUtcInDepartmentTime(file.Timestamp, null)}
              </Text>
            </View>
          </Pressable>
        ))}
        {queued.map((file) => (
          <QueuedFileRow key={file.localId} file={file} />
        ))}
        {files !== null && files.length === 0 && queued.length === 0 ? (
          <View>
            <Text className="pt-4 text-center text-typography-700">{t('call_detail.files.empty')}</Text>
            <Text size="sm" className="pb-4 text-center text-typography-500">
              {t('call_detail.files.empty_description')}
            </Text>
          </View>
        ) : null}
        <Button className="mt-4" onPress={() => void addFile()} accessibilityLabel={t('call_detail.files.add_file')} testID="call-files-add">
          <ButtonText>{t('call_detail.files.add_file')}</ButtonText>
        </Button>
      </View>
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: 104, marginRight: 8, marginBottom: 8 },
  thumb: { width: 104, height: 104, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 10 },
  fileBody: { flex: 1 },
  actions: { flexDirection: 'row', marginTop: 12 },
});
