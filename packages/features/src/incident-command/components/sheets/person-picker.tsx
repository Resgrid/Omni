import { useTranslation } from '@resgrid/i18n';
import { HStack, Input, InputField, Pressable, Text, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

export interface PersonOption {
  userId: string;
  name: string;
  detail: string;
}

export interface PersonPickerProps {
  people: PersonOption[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  /** Members to leave out (the current commander on a transfer). */
  excludeUserIds?: readonly string[];
  testID: string;
}

const MAX_ROWS = 60;

/** Searchable single-select member list (role assignment, transfer of command). */
export const PersonPicker: React.FC<PersonPickerProps> = ({ people, selectedUserId, onSelect, excludeUserIds = [], testID }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return people
      .filter((person) => !excludeUserIds.includes(person.userId))
      .filter((person) => !normalized || person.name.toLocaleLowerCase().includes(normalized) || person.detail.toLocaleLowerCase().includes(normalized))
      .slice(0, MAX_ROWS);
  }, [excludeUserIds, people, query]);

  return (
    <View testID={testID}>
      <Input size="md" variant="outline" className="mb-2">
        <InputField value={query} onChangeText={setQuery} placeholder={t('incident_command.search_people')} accessibilityLabel={t('incident_command.search_people')} testID={`${testID}-search`} />
      </Input>
      {rows.length === 0 ? (
        <Text className="py-3 text-center text-sm text-typography-500">{t('incident_command.no_people_found')}</Text>
      ) : (
        <VStack space="xs">
          {rows.map((person) => {
            const isSelected = person.userId === selectedUserId;
            return (
              <Pressable
                key={person.userId}
                onPress={() => onSelect(person.userId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={person.name}
                className={`rounded-lg border px-3 py-2 ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-outline-100'}`}
                testID={`${testID}-${person.userId}`}
              >
                <HStack className="items-center justify-between" space="sm">
                  <VStack className="min-w-0 flex-1">
                    <Text className="font-medium text-typography-900" numberOfLines={1}>
                      {person.name}
                    </Text>
                    {person.detail ? (
                      <Text className="text-xs text-typography-500" numberOfLines={1}>
                        {person.detail}
                      </Text>
                    ) : null}
                  </VStack>
                  {isSelected ? (
                    <View>
                      <Check size={18} color="#2563eb" />
                    </View>
                  ) : null}
                </HStack>
              </Pressable>
            );
          })}
        </VStack>
      )}
    </View>
  );
};
