import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { WorkOrderFile } from '@resgrid/models';
import { Button, ButtonText, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Image, StyleSheet } from 'react-native';

export interface WorkOrderFilesProps {
  files: readonly WorkOrderFile[];
}

/** Photos and PDFs on the order (withdrawn ones hidden). Images load on request, into memory only. */
export const WorkOrderFiles: React.FC<WorkOrderFilesProps> = ({ files }) => {
  const { t } = useTranslation();
  const images = useWorkOrdersStore((state) => state.imagesById);
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
                <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel={file.Name} testID={`work-order-image-${file.Id}`} />
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
    </VStack>
  );
};

const styles = StyleSheet.create({
  image: { width: '100%', height: 220, borderRadius: 8 },
});
