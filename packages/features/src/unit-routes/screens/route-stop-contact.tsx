import { ProtectedFieldIds, REDACTION_VALUE } from '@resgrid/auth';
import { useRoutesStore } from '@resgrid/data';
import { ContactField, parseCoordinates } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import type { RouteStopContactResultData } from '@resgrid/models';
import { Heading, Loading, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Building, DoorOpen, Globe, LogOut, Mail, MapPin, Phone, User } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';

import { mapBounds, routeColor } from '../lib/route-map';
import { type RenderRouteMap, RouteMapSlot, type RouteMapStop } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteStopContactScreenProps {
  /** The plan stop id (`RouteStopId`). */
  stopId?: string;
  renderMap?: RenderRouteMap;
}

/** The contact's display name: the company, else the person; withheld (REDACTED) parts are never shown. */
export const stopContactName = (contact: Pick<RouteStopContactResultData, 'CompanyName' | 'FirstName' | 'LastName' | 'StopName'>): string => {
  const clean = (value: string | null | undefined): string => (value && value !== REDACTION_VALUE ? value.trim() : '');
  return clean(contact.CompanyName) || [clean(contact.FirstName), clean(contact.LastName)].filter((part) => part !== '').join(' ') || clean(contact.StopName);
};

/**
 * The contact of a route stop (`/routes/stop/contact?stopId=`): name, phones, email and website with tap-to-act, the
 * location / entrance / exit points handed to the navigation app, and a map of them. Cached for offline use.
 */
export default function RouteStopContactScreen({ stopId: stopIdProp, renderMap }: RouteStopContactScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ stopId?: string | string[] }>();
  const stopId = stopIdProp ?? readRouteParam(params.stopId);
  const contact = useRoutesStore((state) => (stopId ? state.stopContactsById[stopId] : undefined)) ?? null;
  const [isLoading, setIsLoading] = useState(!contact && !!stopId);

  useEffect(() => {
    if (!stopId) return undefined;
    let active = true;
    void useRoutesStore
      .getState()
      .fetchStopContact(stopId, { bypassCache: true })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stopId]);

  const points = useMemo<RouteMapStop[]>(() => {
    if (!contact) return [];
    const color = routeColor(null);
    return [
      { key: 'location', value: contact.LocationGpsCoordinates, name: t('routes.location') },
      { key: 'entrance', value: contact.EntranceGpsCoordinates, name: t('routes.entrance') },
      { key: 'exit', value: contact.ExitGpsCoordinates, name: t('routes.exit') },
    ].flatMap((point, index) => {
      const coordinates = parseCoordinates(point.value);
      return coordinates ? [{ id: point.key, order: index + 1, name: point.name, latitude: coordinates.latitude, longitude: coordinates.longitude, status: 0, isCurrent: point.key === 'location', color }] : [];
    });
  }, [contact, t]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.active()));

  if (!contact) {
    return (
      <View className="flex-1 bg-background-50" testID="route-stop-contact-screen">
        <ScreenHeader title={t('routes.stop_contact')} onBack={back} />
        {isLoading ? <Loading /> : <ZeroState icon={User} heading={t('routes.no_contact')} testID="route-stop-contact-missing" />}
      </View>
    );
  }

  const name = stopContactName(contact);

  return (
    <View className="flex-1 bg-background-50" testID="route-stop-contact-screen">
      <ScreenHeader title={t('routes.stop_contact')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot kind="contact" renderMap={renderMap} height={200} stops={points} line={null} geofence={null} color={routeColor(null)} bounds={mapBounds(points, null)} showUserLocation={false} />
        <VStack space="md" className="px-4 pt-4">
          <VStack space="xs" className="rounded-xl bg-background-0 p-4">
            <Heading size="md" testID="route-stop-contact-name">
              {name || t('routes.contact')}
            </Heading>
            {contact.StopName && contact.StopName !== name ? <Text className="text-sm text-typography-500">{contact.StopName}</Text> : null}
            {contact.Description ? <Text className="text-sm text-typography-700">{contact.Description}</Text> : null}
          </VStack>
          <VStack className="rounded-xl bg-background-0 px-4 py-2">
            <ContactField
              label={t('unit_routes.contact_cell_phone')}
              value={contact.CellPhoneNumber}
              action="phone"
              fieldId={ProtectedFieldIds.contactCellPhone}
              icon={<Phone size={16} color="#3b82f6" />}
              testID="route-stop-contact-cell"
            />
            <ContactField label={t('unit_routes.contact_office_phone')} value={contact.OfficePhoneNumber} action="phone" icon={<Building size={16} color="#3b82f6" />} testID="route-stop-contact-office" />
            <ContactField
              label={t('unit_routes.contact_home_phone')}
              value={contact.HomePhoneNumber}
              action="phone"
              fieldId={ProtectedFieldIds.contactHomePhone}
              icon={<Phone size={16} color="#3b82f6" />}
              testID="route-stop-contact-home"
            />
            <ContactField
              label={t('unit_routes.contact_email')}
              value={contact.Email}
              action="email"
              fieldId={ProtectedFieldIds.contactEmail}
              icon={<Mail size={16} color="#3b82f6" />}
              testID="route-stop-contact-email"
            />
            <ContactField label={t('unit_routes.contact_website')} value={contact.Website} action="website" icon={<Globe size={16} color="#3b82f6" />} testID="route-stop-contact-website" />
            <ContactField label={t('routes.location')} value={contact.LocationGpsCoordinates} action="coordinates" icon={<MapPin size={16} color="#3b82f6" />} testID="route-stop-contact-location" />
            <ContactField label={t('routes.entrance')} value={contact.EntranceGpsCoordinates} action="coordinates" icon={<DoorOpen size={16} color="#3b82f6" />} testID="route-stop-contact-entrance" />
            <ContactField label={t('routes.exit')} value={contact.ExitGpsCoordinates} action="coordinates" icon={<LogOut size={16} color="#3b82f6" />} testID="route-stop-contact-exit" />
          </VStack>
        </VStack>
      </ScrollView>
    </View>
  );
}
