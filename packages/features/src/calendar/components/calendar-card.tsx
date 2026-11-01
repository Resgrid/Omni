import { isRedactedValue, ProtectedFieldIds } from '@resgrid/auth';
import { ProtectedText } from '@resgrid/features/data-protection';
import { readableColors } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { Badge, BadgeText, Card, Heading, HStack, htmlToPlainText, Pressable, Text, VStack } from '@resgrid/ui';
import { CalendarDays, CheckCircle, Clock, MapPin, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { canSignUp, formatDayKey, formatItemTime, itemDayRange } from '../lib/calendar-dates';

export interface CalendarCardProps {
  item: CalendarItemResultData;
  onPress: (item: CalendarItemResultData) => void;
  /** `compact` for the month view's day list (Responder's CompactCalendarItem). */
  density?: 'comfortable' | 'compact';
  testID?: string;
}

const ICON_COLOR = '#6b7280';

/**
 * One calendar item (Responder CalendarCard + CompactCalendarItem): title, type, day(s) and time in the department's
 * wall clock, location, a plain-text description preview, attendees and sign-up state. The description is never
 * rendered as HTML in a list row (the details sheet uses HtmlRenderer); withheld (ADP) values show the protected label.
 */
export const CalendarCard: React.FC<CalendarCardProps> = ({ item, onPress, density = 'comfortable', testID }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language;
  const id = testID ?? `calendar-card-${item.CalendarItemId}`;
  const compact = density === 'compact';
  const iconSize = compact ? 12 : 16;
  const range = itemDayRange(item);
  const isMultiDay = item.IsMultiDay === true || range.end > range.start;
  const dayText = isMultiDay ? `${formatDayKey(range.start, locale)} – ${formatDayKey(range.end, locale)}` : formatDayKey(range.start, locale);
  const timeText = item.IsAllDay ? t('calendar.allDay') : `${formatItemTime(item.Start, locale)} - ${formatItemTime(item.End, locale)}`;
  const signUp = canSignUp(item);
  const typeColors = readableColors(item.TypeColor, '#3B82F6');
  const preview = useMemo(() => (!compact && item.Description && !isRedactedValue(item.Description) ? htmlToPlainText(item.Description).trim() : ''), [compact, item.Description]);

  return (
    <Pressable onPress={() => onPress(item)} accessibilityRole="button" className={compact ? 'mb-2' : 'mb-3'} testID={id}>
      <Card variant="elevated" className="bg-background-0">
        <VStack space={compact ? 'xs' : 'sm'}>
          <HStack className="items-start justify-between" space="sm">
            <VStack className="flex-1">
              {isRedactedValue(item.Title) ? (
                <ProtectedText value={item.Title} fieldId={ProtectedFieldIds.calendarTitle} size="sm" testID={`${id}-title-protected`} />
              ) : (
                <Heading size="sm" className="text-typography-700" numberOfLines={compact ? 1 : 2}>
                  {item.Title}
                </Heading>
              )}
              {item.TypeName ? (
                <Badge className="mt-1 self-start" style={{ backgroundColor: typeColors.backgroundColor }} testID={`${id}-type`}>
                  <BadgeText style={{ color: typeColors.textColor }}>{item.TypeName}</BadgeText>
                </Badge>
              ) : null}
            </VStack>
            {item.Attending && signUp ? (
              <View testID={`${id}-attending`}>
                <CheckCircle size={compact ? 16 : 20} color="#16a34a" />
              </View>
            ) : null}
          </HStack>

          <HStack className="flex-wrap items-center" space="sm">
            <HStack className="items-center" space="xs">
              <CalendarDays size={iconSize} color={ICON_COLOR} />
              <Text className={compact ? 'text-xs text-typography-600' : 'text-sm text-typography-600'} testID={`${id}-day`}>
                {dayText}
              </Text>
            </HStack>
            <HStack className="items-center" space="xs">
              <Clock size={iconSize} color={ICON_COLOR} />
              <Text className={compact ? 'text-xs text-typography-600' : 'text-sm text-typography-600'} testID={`${id}-time`}>
                {timeText}
              </Text>
            </HStack>
          </HStack>

          {item.Location ? (
            <HStack className="items-center" space="xs">
              <MapPin size={iconSize} color={ICON_COLOR} />
              <View style={styles.flex}>
                <ProtectedText value={item.Location} fieldId={ProtectedFieldIds.calendarLocation} size={compact ? 'xs' : 'sm'} className="text-typography-600" />
              </View>
            </HStack>
          ) : null}

          {preview ? (
            <Text className="rounded bg-background-50 p-2 text-sm text-typography-600" numberOfLines={3} testID={`${id}-preview`}>
              {preview}
            </Text>
          ) : null}

          {!compact && item.Attendees && item.Attendees.length > 0 ? (
            <HStack className="items-center" space="xs">
              <Users size={iconSize} color={ICON_COLOR} />
              <Text className="text-sm text-typography-600">{t('calendar.attendeesCount', { count: item.Attendees.length })}</Text>
            </HStack>
          ) : null}

          {signUp ? (
            <HStack className="items-center justify-between border-t border-outline-100 pt-2">
              <Text className="text-xs text-typography-500">{t('calendar.signupAvailable')}</Text>
              {item.Attending ? (
                <Badge action="success" testID={`${id}-signed-up`}>
                  <BadgeText>{t('calendar.signedUp')}</BadgeText>
                </Badge>
              ) : (
                <Badge action="info" variant="outline">
                  <BadgeText>{t('calendar.tapToSignUp')}</BadgeText>
                </Badge>
              )}
            </HStack>
          ) : null}
        </VStack>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
