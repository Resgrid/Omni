import { ProtectedFieldIds, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { safeFormatDate } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { selectPendingPersonnelWrite, usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { ContactField } from '@resgrid/features/contacts';
import { ProtectedRevealBar, ProtectedText } from '@resgrid/features/data-protection';
import { CurrentStatusBadge, PersonnelStatusSheet, type StatusPickerTab } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type PersonnelInfoResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { Box, Button, ButtonText, Heading, HStack, Loading, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { MailIcon, SmartphoneIcon, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';

import { personName } from '../lib/personnel-filters';

export interface PersonnelDetailScreenProps {
  userId?: string;
  /** Map slot for the member's last known position (supplied by the app; hidden without CanViewPII). */
  renderMap?: (person: PersonnelInfoResultData) => React.ReactNode;
}

const Row: React.FC<{ label: string; children: React.ReactNode; testID?: string }> = ({ label, children, testID }) => (
  <HStack className="items-center justify-between border-b border-outline-100 py-2.5" space="md" testID={testID}>
    <Text className="text-sm text-typography-500">{label}</Text>
    <View className="flex-1 items-end">{children}</View>
  </HStack>
);

/**
 * A member's detail page (Dispatch baseline): status and staffing (set on their behalf where the variant has
 * `status.onBehalf`), group, roles, and contact details — email, phone and id number only with `CanViewPII`.
 */
export default function PersonnelDetailScreen({ userId: userIdProp, renderMap }: PersonnelDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = userIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const userId = isSafeRouteId(rawId) ? rawId : null;
  const { canUserViewPII } = useSecurity();
  const statusCapability = useCapability('status');
  const person = usePersonnelStore((state) => (userId ? state.personnel.find((row) => row.UserId === userId) : undefined));
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const hasPending = usePersonnelStatusStore((state) => (userId ? !!selectPendingPersonnelWrite(state, userId, 'status') : false));
  const [sheetTab, setSheetTab] = useState<StatusPickerTab | null>(null);

  const refresh = useCallback(async () => {
    await usePersonnelStore.getState().fetchPersonnel({ bypassCache: true });
  }, []);

  useEffect(() => {
    if (userId) void refresh();
  }, [refresh, userId]);

  useRealtimeEvent('personnelStatusUpdated', () => void refresh(), !!userId);
  useRealtimeEvent('personnelStaffingUpdated', () => void refresh(), !!userId);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/personnel'));

  if (!person || !userId) {
    return (
      <View className="flex-1 bg-background-50" testID="personnel-detail-screen">
        <ScreenHeader title={t('personnel.details')} onBack={back} />
        {isLoading && userId ? <Loading /> : <ZeroState icon={Users} heading={t('personnel.not_found')} testID="personnel-detail-missing" />}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-50" testID="personnel-detail-screen">
      <ScreenHeader title={personName(person)} onBack={back} />
      {canUserViewPII ? <ProtectedRevealBar onRefresh={refresh} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Box className="mx-4 mt-4 items-center rounded-xl border border-outline-200 bg-background-0 p-5">
          <Heading size="lg" className="text-typography-900">
            {personName(person)}
          </Heading>
          {person.GroupName ? <Text className="mt-1 text-sm text-typography-500">{person.GroupName}</Text> : null}
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <Row label={t('personnel.status')} testID="personnel-detail-status">
            <CurrentStatusBadge text={person.Status} color={person.StatusColor} baseType={person.StatusBaseType} isPending={hasPending} showAvailability />
          </Row>
          {person.StatusDestinationName ? (
            <Row label={t('units.destination')}>
              <Text className="text-sm text-typography-900">{person.StatusDestinationName}</Text>
            </Row>
          ) : null}
          {person.StatusTimestamp ? (
            <Row label={t('personnel.status_updated')}>
              <Text className="text-sm text-typography-900">{safeFormatDate(person.StatusTimestamp, 'MMM d, yyyy h:mm a')}</Text>
            </Row>
          ) : null}
          <Row label={t('personnel.staffing')} testID="personnel-detail-staffing">
            <CurrentStatusBadge text={person.Staffing} color={person.StaffingColor} baseType={person.StaffingBaseType} kind="staffing" showAvailability />
          </Row>
          {statusCapability.onBehalf ? (
            <HStack space="sm" className="mt-3">
              <Button className="flex-1" size="sm" onPress={() => setSheetTab('status')} testID="personnel-detail-set-status">
                <ButtonText>{t('status.set_status')}</ButtonText>
              </Button>
              {statusCapability.staffing ? (
                <Button className="flex-1" size="sm" variant="outline" onPress={() => setSheetTab('staffing')} testID="personnel-detail-set-staffing">
                  <ButtonText>{t('personnel.set_staffing')}</ButtonText>
                </Button>
              ) : null}
            </HStack>
          ) : null}
        </Box>

        {(person.Roles ?? []).length > 0 ? (
          <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
            <Heading size="sm" className="mb-2 text-typography-900">
              {t('personnel.roles')}
            </Heading>
            <HStack space="xs" className="flex-wrap">
              {person.Roles.map((role) => (
                <Text key={role} className="mb-1 rounded-full bg-background-100 px-2 py-0.5 text-xs text-typography-700">
                  {role}
                </Text>
              ))}
            </HStack>
          </Box>
        ) : null}

        {canUserViewPII ? (
          <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4" testID="personnel-detail-contact">
            <Heading size="sm" className="mb-1 text-typography-900">
              {t('personnel.contact_information')}
            </Heading>
            {person.IdentificationNumber ? (
              <Row label={t('personnel.identification_number')}>
                <ProtectedText value={person.IdentificationNumber} fieldId={ProtectedFieldIds.personnelIdentificationNumber} size="sm" />
              </Row>
            ) : null}
            <ContactField label={t('contacts.email')} value={person.EmailAddress} action="email" icon={<MailIcon size={18} color="#6b7280" />} testID="personnel-detail-email" />
            <ContactField label={t('contacts.mobile')} value={person.MobilePhone} action="phone" icon={<SmartphoneIcon size={18} color="#6b7280" />} testID="personnel-detail-phone" />
          </Box>
        ) : null}

        {canUserViewPII && person.Location && renderMap ? <VStack className="mx-4 mt-4 h-56 overflow-hidden rounded-xl">{renderMap(person)}</VStack> : null}
      </ScrollView>

      {statusCapability.onBehalf ? <PersonnelStatusSheet isOpen={sheetTab !== null} onClose={() => setSheetTab(null)} userId={person.UserId} initialTab={sheetTab ?? 'status'} /> : null}
    </View>
  );
}
