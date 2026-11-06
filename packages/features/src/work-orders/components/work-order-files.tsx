import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { WorkOrderFile } from '@resgrid/models';
import { Button, ButtonText, ImageViewer, Pressable, Text, VStack } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';

export interface WorkOrderFilesProps {
  files: readonly WorkOrderFile[];
}

/** Photos and PDFs on the order (withdrawn ones hidden). Images load on request, into memory only; tap one to see it full screen. */
export const WorkOrderFiles: React.FC<WorkOrderFilesProps> = ({ files }) => {
  const { t } = useTranslation();
  const images = useWorkOrdersStore((state) => state.imagesById);
  const [viewing, setViewing] = useState<{ uri: string; name: string } | null>(null);
  const viewingSource = useMemo(() => (viewing ? { uri: viewing.uri } : null), [viewing]);
  const visible = files.filter((file) => !file.WithdrawnOn);

  if (visible.length === 0) return null;
  return (
    <VStack space="xs" testID="work-order-files">
      <Text className="font-semibold text-typography-900">{t('workOrders.files')}</Text>
      {visible.map((file) => {
        const uri = images[file.Id];
        return (
          <VStack key={file.Id} space="xs">
            {file.ContentType.startsWith('image/') ? (
              uri ? (
                <Pressable onPress={() => setViewing({ uri, name: file.Name })} accessibilityRole="imagebutton" accessibilityLabel={file.Name} testID={`work-order-image-open-${file.Id}`}>
                  <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel={file.Name} testID={`work-order-image-${file.Id}`} />
                </Pressable>
              ) : (
                <Button variant="link" size="sm" onPress={() => void useWorkOrdersStore.getState().fetchImage(file.Id)} testID={`work-order-file-${file.Id}`}>
                  <ButtonText>{t('workOrders.viewPhoto', { name: file.Name })}</ButtonText>
                </Button>
              )
            ) : (
              <Text className="text-typography-500">{file.Name}</Text>
            )}
          </VStack>
        );
      })}
      <ImageViewer source={viewingSource} caption={viewing?.name || undefined} label={viewing?.name || t('workOrders.files')} onClose={() => setViewing(null)} testID="work-order-image-viewer" />
    </VStack>
  );
};

const styles = StyleSheet.create({
  image: { width: '100%', height: 220, borderRadius: 8 },
});
