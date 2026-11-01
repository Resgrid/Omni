import { isRedactedValue, ProtectedFieldIds } from '@resgrid/auth';
import { personnelFullName, useCalendarStore, usePersonnelStore } from '@resgrid/data';
import { ConfirmDialog } from '@resgrid/features/auth-ui';
import { ProtectedText } from '@resgrid/features/data-protection';
import { readableColors } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { Badge, BadgeText, Box, Button, ButtonSpinner, ButtonText, CustomBottomSheet, Heading, HStack, HtmlRenderer, ScrollView, Text, Textarea, TextareaInput, useToast, VStack } from '@resgrid/ui';
import { AlertCircle, CalendarDays, CheckCircle, Clock, FileText, MapPin, User, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { canSignUp, formatDayKey, formatItemTime, itemDayRange } from '../lib/calendar-dates';

export interface CalendarItemDetailsSheetProps {
  item: CalendarItemResultData | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the member signed up or cancelled, so the lists can refetch. */
  onAttendanceChanged?: (calendarItemId: string) => void;
}

/** Sign-up types (Core CalendarItemSignupTypes): 0 none, 1 RSVP, 2+ with a note. */
const SIGNUP_WITH_NOTE = 2;
const ICON_COLOR = '#6b7280';

/**
 * A calendar item's details (Responder CalendarItemDetailsSheet): date and time in the department's wall clock,
 * location, the description through HtmlRenderer (sanitized), the creator, attendees, and sign-up / cancel attendance.
 * Attendance is online only; a failure keeps the sheet open with the reason. Withheld (ADP) values show the protected label.
 */
export const CalendarItemDetailsSheet: React.FC<CalendarItemDetailsSheetProps> = ({ item, isOpen, onClose, onAttendanceChanged }) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const locale = i18n?.language;
  const detail = useCalendarStore((state) => (item ? state.itemDetailsById[item.CalendarItemId] : undefined));
  const personnel = usePersonnelStore((state) => state.personnel);
  const isPersonnelLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const current = detail ?? item;
  const itemId = item?.CalendarItemId ?? null;

  useEffect(() => {
    setNote('');
    setShowNote(false);
    setConfirmCancel(false);
    if (!isOpen || !itemId) return;
    void useCalendarStore.getState().fetchCalendarItem(itemId);
    if (usePersonnelStore.getState().personnel.length === 0) void usePersonnelStore.getState().fetchPersonnel();
  }, [isOpen, itemId]);

  const changeAttendance = useCallback(
    async (attending: boolean) => {
      if (!current || isSaving) return;
      setIsSaving(true);
      try {
        const ok = await useCalendarStore.getState().setAttendance(current.CalendarItemId, attending, attending ? note.trim() : '');
        if (ok) {
          toast.success(attending ? t('calendar.attendanceUpdated.signedUp') : t('calendar.attendanceUpdated.unsignedUp'), t('calendar.attendanceUpdated.title'));
          setNote('');
          setShowNote(false);
          onAttendanceChanged?.(current.CalendarItemId);
        } else {
          const error = useCalendarStore.getState().attendanceError;
          toast.error(error ? t(error.messageKey) : t('calendar.error.attendanceUpdate'), t('calendar.error.title'));
        }
      } finally {
        setIsSaving(false);
        setConfirmCancel(false);
      }
    },
    [current, isSaving, note, onAttendanceChanged, t, toast]
  );

  if (!current) return null;

  const range = itemDayRange(current);
  const signUp = canSignUp(current);
  const typeColors = readableColors(current.TypeColor, '#3B82F6');
  const creator = current.CreatorUserId ? personnel.find((person) => person.UserId === current.CreatorUserId) : undefined;
  const creatorName = creator ? personnelFullName(creator) : isPersonnelLoading ? t('common.loading') : t('common.unknown_user');
  const timeText = current.IsAllDay ? t('calendar.allDay') : `${formatItemTime(current.Start, locale)} - ${formatItemTime(current.End, locale)}`;
  const dayText = range.end > range.start ? `${formatDayKey(range.start, locale, 'long')} – ${formatDayKey(range.end, locale, 'long')}` : formatDayKey(range.start, locale, 'long');

  const handleSignUp = () => {
    if (current.SignupType >= SIGNUP_WITH_NOTE && !showNote) {
      setShowNote(true);
      return;
    }
    void changeAttendance(true);
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[85]} testID="calendar-item-details">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VStack space="lg">
          <VStack space="sm">
            <HStack className="items-start justify-between" space="sm">
              <View style={styles.flex}>
                {isRedactedValue(current.Title) ? (
                  <ProtectedText value={current.Title} fieldId={ProtectedFieldIds.calendarTitle} size="lg" />
                ) : (
                  <Heading size="lg" accessibilityRole="header" testID="calendar-item-details-title">
                    {current.Title}
                  </Heading>
                )}
              </View>
              {current.Attending && signUp ? (
                <View testID="calendar-item-details-attending">
                  <CheckCircle size={24} color="#16a34a" />
                </View>
              ) : null}
            </HStack>
            {current.TypeName ? (
              <Badge className="self-start" style={{ backgroundColor: typeColors.backgroundColor }}>
                <BadgeText style={{ color: typeColors.textColor }}>{current.TypeName}</BadgeText>
              </Badge>
            ) : null}
          </VStack>

          <VStack space="xs">
            <HStack className="items-center" space="sm">
              <CalendarDays size={18} color={ICON_COLOR} />
              <Text className="flex-1 font-medium text-typography-900">{dayText}</Text>
            </HStack>
            <HStack className="items-center" space="sm">
              <Clock size={18} color={ICON_COLOR} />
              <Text className="text-typography-600" testID="calendar-item-details-time">
                {timeText}
              </Text>
            </HStack>
          </VStack>

          {current.Location ? (
            <HStack className="items-center" space="sm">
              <MapPin size={18} color={ICON_COLOR} />
              <View style={styles.flex}>
                <ProtectedText value={current.Location} fieldId={ProtectedFieldIds.calendarLocation} className="text-typography-600" />
              </View>
            </HStack>
          ) : null}

          {current.Description ? (
            <VStack space="xs">
              <HStack className="items-center" space="sm">
                <FileText size={18} color={ICON_COLOR} />
                <Heading size="sm">{t('calendar.description')}</Heading>
              </HStack>
              {/* A withheld description is not HTML: the sentinel must never render as body copy. */}
              {isRedactedValue(current.Description) ? (
                <Box className="rounded-lg bg-background-50 p-3">
                  <ProtectedText value={current.Description} fieldId={ProtectedFieldIds.calendarDescription} />
                </Box>
              ) : (
                <Box className="rounded-lg bg-background-50 p-1">
                  <HtmlRenderer html={current.Description} style={styles.html} scrollEnabled testID="calendar-item-details-description" />
                </Box>
              )}
            </VStack>
          ) : null}

          {current.CreatorUserId ? (
            <HStack className="items-center" space="sm">
              <User size={18} color={ICON_COLOR} />
              <Text className="text-typography-600" testID="calendar-item-details-creator">{`${t('calendar.createdBy')}: ${creatorName}`}</Text>
            </HStack>
          ) : null}

          {signUp ? (
            <VStack space="sm" className="rounded-lg border border-info-200 bg-info-50 p-4" testID="calendar-item-details-signup">
              <HStack className="items-center" space="sm">
                <AlertCircle size={18} color="#3b82f6" />
                <Heading size="sm">{t('calendar.signup.title')}</Heading>
              </HStack>
              {showNote ? (
                <VStack space="xs">
                  <Text className="text-sm text-typography-700">{t('calendar.signup.notePrompt')}</Text>
                  <Textarea size="md" isDisabled={isSaving}>
                    <TextareaInput value={note} onChangeText={setNote} placeholder={t('calendar.signup.notePlaceholder')} accessibilityLabel={t('calendar.signup.notePlaceholder')} testID="calendar-item-details-note" />
                  </Textarea>
                </VStack>
              ) : null}
              <HStack space="sm">
                {current.Attending ? (
                  <Button variant="outline" action="negative" className="flex-1" onPress={() => setConfirmCancel(true)} isDisabled={isSaving} testID="calendar-item-details-unsignup">
                    {isSaving ? <ButtonSpinner /> : <ButtonText>{t('calendar.unsignup')}</ButtonText>}
                  </Button>
                ) : showNote ? (
                  <>
                    <Button
                      variant="outline"
                      action="secondary"
                      className="flex-1"
                      onPress={() => {
                        setShowNote(false);
                        setNote('');
                      }}
                      isDisabled={isSaving}
                      testID="calendar-item-details-note-cancel"
                    >
                      <ButtonText>{t('common.cancel')}</ButtonText>
                    </Button>
                    <Button action="positive" className="flex-1" onPress={() => void changeAttendance(true)} isDisabled={isSaving} testID="calendar-item-details-confirm-signup">
                      {isSaving ? <ButtonSpinner /> : <ButtonText>{t('calendar.confirmSignup')}</ButtonText>}
                    </Button>
                  </>
                ) : (
                  <Button action="positive" className="flex-1" onPress={handleSignUp} isDisabled={isSaving} testID="calendar-item-details-signup-button">
                    {isSaving ? <ButtonSpinner /> : <ButtonText>{t('calendar.signup.button')}</ButtonText>}
                  </Button>
                )}
              </HStack>
            </VStack>
          ) : null}

          {current.Attendees && current.Attendees.length > 0 ? (
            <VStack space="sm" testID="calendar-item-details-attendees">
              <HStack className="items-center" space="sm">
                <Users size={18} color={ICON_COLOR} />
                <Heading size="sm">{`${t('calendar.attendees.title')} (${current.Attendees.length})`}</Heading>
              </HStack>
              {current.Attendees.map((attendee) => (
                <HStack key={`${attendee.UserId}-${attendee.CalendarItemId}`} className="items-center rounded-lg bg-background-50 p-3" space="sm">
                  <User size={16} color={ICON_COLOR} />
                  <VStack className="flex-1">
                    <Text className="font-medium text-typography-900">{attendee.Name}</Text>
                    {attendee.GroupName ? <Text className="text-sm text-typography-500">{attendee.GroupName}</Text> : null}
                    {attendee.Note ? <Text className="text-sm text-typography-600">{attendee.Note}</Text> : null}
                  </VStack>
                  <Badge action={attendee.AttendeeType === 1 ? 'success' : 'info'} variant={attendee.AttendeeType === 1 ? 'solid' : 'outline'}>
                    <BadgeText>{attendee.AttendeeType === 1 ? t('calendar.required') : t('calendar.optional')}</BadgeText>
                  </Badge>
                </HStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>

      <ConfirmDialog
        isOpen={confirmCancel}
        title={t('calendar.confirmUnsignup.title')}
        message={t('calendar.confirmUnsignup.message')}
        confirmLabel={t('calendar.unsignup')}
        cancelLabel={t('common.cancel')}
        destructive
        isBusy={isSaving}
        onConfirm={() => void changeAttendance(false)}
        onCancel={() => setConfirmCancel(false)}
        testID="calendar-unsignup-confirm"
      />
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 16 },
  html: { minHeight: 120, height: 160 },
});
