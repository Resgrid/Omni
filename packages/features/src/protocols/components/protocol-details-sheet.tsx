import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, Text } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ProtocolContent } from './protocol-content';

export interface ProtocolDetailsSheetProps {
  protocol: CallProtocolsResultData | null;
  isOpen: boolean;
  onClose: () => void;
}

/** Protocol details in a bottom sheet (Unit baseline): code, description, sanitized text, updated date. */
export const ProtocolDetailsSheet: React.FC<ProtocolDetailsSheetProps> = ({ protocol, isOpen, onClose }) => {
  const { t } = useTranslation();
  const isVisible = isOpen ? protocol !== null : false;
  const updated = protocol ? formatUtcInDepartmentTime(protocol.UpdatedOn || protocol.CreatedOn, null) : '';
  return (
    <CustomBottomSheet isOpen={isVisible} onClose={onClose} snapPoints={[80]} testID="protocol-details-sheet">
      {protocol ? (
        <ScrollView style={styles.scroll}>
          <Text className="mb-2 text-lg font-bold text-typography-900" accessibilityRole="header">
            {t('protocols.details.title')}
          </Text>
          <ProtocolContent protocol={protocol} scrollText />
          {updated ? (
            <Text size="xs" className="mt-3 text-typography-500">
              {`${t('protocols.details.updated')}: ${updated}`}
            </Text>
          ) : null}
          <View style={styles.footer}>
            <Button variant="outline" onPress={onClose} accessibilityLabel={t('protocols.details.close')} testID="protocol-details-close">
              <ButtonText>{t('protocols.details.close')}</ButtonText>
            </Button>
          </View>
        </ScrollView>
      ) : null}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  footer: { marginTop: 16, marginBottom: 8 },
});
