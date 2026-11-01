import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Button, ButtonText } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CallNotesPanel } from '../call-notes-panel';

export interface CallMediaPanelProps {
  call: CallResultData;
  onOpenImages: () => void;
  onOpenFiles: () => void;
}

/** Notes inline (with the offline-capable composer), plus the call's images and files. */
export const CallMediaPanel: React.FC<CallMediaPanelProps> = ({ call, onOpenImages, onOpenFiles }) => {
  const { t } = useTranslation();
  return (
    <View testID="call-media-panel">
      <View style={styles.buttons}>
        <Button variant="outline" size="sm" className="mr-2 flex-1" onPress={onOpenImages} accessibilityLabel={`${t('call_detail.images')} (${call.ImgagesCount || 0})`} testID="call-media-images">
          <ButtonText>{`${t('call_detail.images')} (${call.ImgagesCount || 0})`}</ButtonText>
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onPress={onOpenFiles} accessibilityLabel={`${t('call_detail.files.button')} (${call.FileCount || 0})`} testID="call-media-files">
          <ButtonText>{`${t('call_detail.files.button')} (${call.FileCount || 0})`}</ButtonText>
        </Button>
      </View>
      <CallNotesPanel callId={call.CallId} showSearch={call.NotesCount > 5} />
    </View>
  );
};

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16 },
});
