import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { HtmlRenderer, htmlToPlainText, Text } from '@resgrid/ui';
import { Tag } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

export interface ProtocolContentProps {
  protocol: Pick<CallProtocolsResultData, 'Id' | 'Name' | 'Code' | 'Description' | 'ProtocolText'>;
  /** Scroll the protocol text inside its own surface (details sheet) instead of growing with it. */
  scrollText?: boolean;
  htmlStyle?: StyleProp<ViewStyle>;
  showName?: boolean;
  testID?: string;
}

/**
 * A protocol's code, description and text (Unit/IC baseline + Responder extras). The text is server HTML and only ever
 * reaches the screen through `HtmlRenderer` (sanitized; iframe without allow-same-origin on web) — never a raw WebView.
 */
export const ProtocolContent: React.FC<ProtocolContentProps> = ({ protocol, scrollText = false, htmlStyle, showName = true, testID = 'protocol-content' }) => {
  const { t } = useTranslation();
  const description = useMemo(() => (protocol.Description ? htmlToPlainText(protocol.Description) : ''), [protocol.Description]);
  return (
    <View testID={testID}>
      {showName ? (
        <Text className="text-base font-semibold text-typography-900" accessibilityRole="header">
          {protocol.Name}
        </Text>
      ) : null}
      {protocol.Code ? (
        <View style={styles.code} accessible accessibilityLabel={`${t('protocols.details.code')}: ${protocol.Code}`}>
          <View style={styles.icon}>
            <Tag size={14} color="#6B7280" />
          </View>
          <Text size="sm" className="text-typography-600">
            {protocol.Code}
          </Text>
        </View>
      ) : null}
      {description ? (
        <Text size="sm" className="mt-1 text-typography-600">
          {description}
        </Text>
      ) : null}
      {protocol.ProtocolText ? (
        <View style={styles.text}>
          <HtmlRenderer
            html={protocol.ProtocolText}
            rendererKey={protocol.Id}
            scrollEnabled={scrollText}
            showsVerticalScrollIndicator={scrollText}
            style={StyleSheet.flatten([scrollText ? styles.scrollHtml : styles.html, htmlStyle])}
            testID={`${testID}-html`}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  code: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  icon: { marginRight: 4 },
  text: { marginTop: 8 },
  html: { minHeight: 160 },
  scrollHtml: { height: 360 },
});
