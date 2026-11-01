import { useTerm } from '@resgrid/auth';
import { useContactsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ContactResultData } from '@resgrid/models';
import { FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, RefreshControl, ScrollView, Text, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Contact, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ContactCard } from '../components/contact-card';
import { contactDisplayName, contactMatches } from '../lib/contact-format';
import { contactsRoutes } from '../routes';

export interface ContactsListScreenProps {
  /** Where a tap goes; defaults to the contact detail route (Unit opens its sheet-style detail the same way). */
  onSelectContact?: (contact: ContactResultData) => void;
}

/** The department's contacts (U/I + R): search, category chips, important first then by name, pull to refresh. Offline from the persisted store. */
export default function ContactsListScreen({ onSelectContact }: ContactsListScreenProps) {
  const { t } = useTranslation();
  const title = useTerm('module.contacts', t('contacts.title'));
  const contacts = useContactsStore((state) => state.contacts);
  const categories = useContactsStore((state) => state.categories);
  const isLoading = useContactsStore((state) => state.loading.contacts === true);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void useContactsStore.getState().fetchContacts();
    void useContactsStore.getState().fetchCategories();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await useContactsStore.getState().fetchContacts({ bypassCache: true });
    setIsRefreshing(false);
  }, []);

  const visible = useMemo(
    () =>
      contacts
        .filter((contact) => !contact.IsDeleted && (!categoryId || contact.ContactCategoryId === categoryId) && contactMatches(contact, query))
        .sort((a, b) => Number(!!b.IsImportant) - Number(!!a.IsImportant) || contactDisplayName(a).localeCompare(contactDisplayName(b))),
    [categoryId, contacts, query]
  );

  const select = useCallback((contact: ContactResultData) => (onSelectContact ? onSelectContact(contact) : router.push(contactsRoutes.detail(contact.ContactId))), [onSelectContact]);

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="contacts-list-screen" accessibilityLabel={title}>
      <Input className="mb-2 bg-background-0" size="md" variant="outline">
        <InputSlot className="pl-3">
          <InputIcon as={Search} />
        </InputSlot>
        <InputField testID="contacts-search" placeholder={t('contacts.search')} value={query} onChangeText={setQuery} accessibilityLabel={t('contacts.search')} />
        {query ? (
          <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
            <InputIcon as={X} />
          </InputSlot>
        ) : null}
      </Input>
      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10">
          <HStack space="sm">
            {[{ ContactCategoryId: '', Name: t('contacts.all_categories') }, ...categories].map((category) => {
              const selected = (categoryId ?? '') === category.ContactCategoryId;
              return (
                <Pressable
                  key={category.ContactCategoryId || 'all'}
                  testID={`contacts-category-${category.ContactCategoryId || 'all'}`}
                  onPress={() => setCategoryId(category.ContactCategoryId || null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-full px-3 py-1.5 ${selected ? 'bg-primary-500' : 'bg-background-100'}`}
                >
                  <Text className={`text-sm ${selected ? 'text-typography-0' : 'text-typography-700'}`}>{category.Name}</Text>
                </Pressable>
              );
            })}
          </HStack>
        </ScrollView>
      ) : null}
      {isLoading && !isRefreshing && contacts.length === 0 ? (
        <Loading />
      ) : visible.length === 0 ? (
        <ZeroState icon={Contact} heading={t('contacts.empty')} description={query ? undefined : t('contacts.emptyDescription')} testID="contacts-empty" />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(contact) => contact.ContactId}
          renderItem={({ item }) => <ContactCard contact={item} onPress={select} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 96 }}
          testID="contacts-list"
        />
      )}
    </View>
  );
}
