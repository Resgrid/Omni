import { useTranslation } from '@resgrid/i18n';
import { HStack, Input, InputField, Pressable } from '@resgrid/ui';
import { Search, X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

/** The search row under a console panel header. */
export const PanelSearch: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string; testID: string }> = ({ value, onChange, placeholder, testID }) => {
  const { t } = useTranslation();
  return (
    <HStack space="sm" className="items-center border-b border-outline-200 px-2">
      <View>
        <Search size={14} color="#9ca3af" />
      </View>
      <Input variant="underlined" size="sm" className="flex-1 border-b-0">
        <InputField value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={placeholder} autoCapitalize="none" autoCorrect={false} testID={testID} />
      </Input>
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('dispatch_console.clear_search')} testID={`${testID}-clear`}>
          <View>
            <X size={14} color="#9ca3af" />
          </View>
        </Pressable>
      ) : null}
    </HStack>
  );
};
