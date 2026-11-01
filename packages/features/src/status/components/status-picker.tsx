import { useTranslation } from '@resgrid/i18n';
import { type CallResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, ScrollView, Spinner, Text, Textarea, TextareaInput, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { destinationLabel, type DestinationLists, type DestinationTab, getDestinationTabs, NO_DESTINATION, resolveEffectiveDestination, type StatusDestination, toRespondingTo } from '../lib/status-destination';
import { canSubmitStatusWithoutInput, type CurrentStatusRef, getOfferedStatuses, hasNoteStep, isNoteRequired, resolveCurrentStatusId, statusDetailType, type StatusOption, toOptionId } from '../lib/status-flow';
import { StatusSubmitError } from '../lib/status-submit-error';
import { StatusDestinationList } from './status-destination-list';
import { StatusOptionRow } from './status-option';

export type StatusPickerSubject = 'unit' | 'personnel';
export type StatusPickerTab = 'status' | 'staffing';
export type StatusPickerStep = 'select' | 'destination' | 'note';
/** The data layer's write outcome: sent now, queued for reconnect, or refused by the server. */
export type StatusSubmitOutcome = 'sent' | 'queued' | 'rejected';

export interface StatusSelection {
  status: StatusOption;
  destination: StatusDestination;
  respondingTo: string;
  respondingToType: number | null;
  note: string;
}

export interface StaffingSelection {
  staffing: StatusOption;
  note: string;
}

export interface StatusPickerProps {
  isOpen: boolean;
  onClose: () => void;
  subject: StatusPickerSubject;
  /** The unit or person the status is set for, shown when setting it on someone's behalf. */
  subjectName?: string;
  isOnBehalf?: boolean;
  statuses: readonly StatusOption[];
  current?: CurrentStatusRef | null;
  staffingOptions?: readonly StatusOption[];
  currentStaffing?: CurrentStatusRef | null;
  /** Shows the staffing tab (capabilities.status.staffing, personnel subject). */
  showStaffing?: boolean;
  initialTab?: StatusPickerTab;
  /** Opens with this status selected (sidebar buttons that open the sheet on a chosen status). */
  initialStatusId?: number | string | null;
  /** When true with `initialStatusId`, acts as if that status had just been held (sidebar hold-to-confirm buttons). */
  initialHoldConfirmed?: boolean;
  destinations?: DestinationLists;
  isLoadingDestinations?: boolean;
  /** The call a status defaults to (active call, else the call the current status points at). */
  defaultCall?: CallResultData | null;
  /** True while a default call may still arrive with the destination lists (submits wait for them). */
  hasPotentialDefaultCall?: boolean;
  /** Unit's rule: older call-only Detail values also offer stations and POIs. */
  lenientDestinations?: boolean;
  /** Department "Hold to set status" (config StatusHoldToConfirm). */
  holdToConfirm?: boolean;
  onSubmitStatus: (selection: StatusSelection) => Promise<StatusSubmitOutcome>;
  onSubmitStaffing?: (selection: StaffingSelection) => Promise<StatusSubmitOutcome>;
  testID?: string;
}

const EMPTY_LISTS: DestinationLists = { calls: [], stations: [], pois: [] };

/**
 * The one status picker for all five apps (omni-plan §7.10): Unit's status sheet (destinations, status flow,
 * hold-to-confirm), Responder's personnel status and staffing sheets and Dispatch's on-behalf sheets. It is
 * presentational: callers pass the options, destinations and a submit handler (see UnitStatusSheet and
 * PersonnelStatusSheet, which bind it to the data stores and the outbox).
 *
 * Steps: select → destination (when the status Detail offers any) → note (when its Note type asks for one); the last
 * step submits. Meaning is read from BaseType and Detail/Note — never from a status id or its text.
 */
export const StatusPicker: React.FC<StatusPickerProps> = ({
  isOpen,
  onClose,
  subject,
  subjectName,
  isOnBehalf = false,
  statuses,
  current,
  staffingOptions = [],
  currentStaffing,
  showStaffing = false,
  initialTab = 'status',
  initialStatusId = null,
  initialHoldConfirmed = false,
  destinations = EMPTY_LISTS,
  isLoadingDestinations = false,
  defaultCall = null,
  hasPotentialDefaultCall = false,
  lenientDestinations = false,
  holdToConfirm = false,
  onSubmitStatus,
  onSubmitStaffing,
  testID = 'status-picker',
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [tab, setTab] = useState<StatusPickerTab>(initialTab);
  const [step, setStep] = useState<StatusPickerStep>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStaffingId, setSelectedStaffingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<StatusDestination>(NO_DESTINATION);
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);
  const [destinationTab, setDestinationTab] = useState<DestinationTab>('call');
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [isHoldHintVisible, setIsHoldHintVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-entry guard: a double tap within one frame must not send twice; a submission that outlives its open is ignored.
  const pendingRef = useRef<number | null>(null);
  const counterRef = useRef(0);

  // Every open (and close) starts clean: the sheet may stay mounted at the root between uses.
  useEffect(() => {
    pendingRef.current = null;
    setTab(showStaffing ? initialTab : 'status');
    setStep('select');
    setSelectedId(isOpen && initialStatusId != null ? toOptionId(initialStatusId) : null);
    setSelectedStaffingId(null);
    setSelection(NO_DESTINATION);
    setHasExplicitChoice(false);
    setNote('');
    setShowAll(false);
    setHoldPending(isOpen && initialStatusId != null && initialHoldConfirmed);
    setIsHoldHintVisible(false);
    setIsSubmitting(false);
    setError(null);
  }, [isOpen, initialStatusId, initialHoldConfirmed, initialTab, showStaffing]);

  const isStaffingTab = showStaffing && tab === 'staffing';
  const currentStatusId = useMemo(() => resolveCurrentStatusId(statuses, current), [current, statuses]);
  const currentStaffingId = useMemo(() => resolveCurrentStatusId(staffingOptions, currentStaffing), [currentStaffing, staffingOptions]);
  const offered = useMemo(() => getOfferedStatuses(statuses, currentStatusId, showAll), [currentStatusId, showAll, statuses]);
  const hasNextRestriction = useMemo(() => showAll && getOfferedStatuses(statuses, currentStatusId, false).isRestricted, [currentStatusId, showAll, statuses]);

  const selectedStatus = useMemo(() => statuses.find((option) => toOptionId(option.Id) === selectedId) ?? null, [selectedId, statuses]);
  const selectedStaffing = useMemo(() => staffingOptions.find((option) => toOptionId(option.Id) === selectedStaffingId) ?? null, [selectedStaffingId, staffingOptions]);

  const detail = statusDetailType(selectedStatus);
  const destinationTabs = useMemo(() => (detail > 0 ? getDestinationTabs(detail, lenientDestinations) : []), [detail, lenientDestinations]);
  const hasDestinationStep = destinationTabs.length > 0;
  const allowsCalls = destinationTabs.includes('call');
  const effectiveDestination = useMemo(
    () => (selectedStatus ? resolveEffectiveDestination({ detail, lenient: lenientDestinations, selection, hasExplicitChoice, defaultCall }) : NO_DESTINATION),
    [defaultCall, detail, hasExplicitChoice, lenientDestinations, selectedStatus, selection]
  );
  const isAwaitingDestinations = isLoadingDestinations && (hasDestinationStep || hasPotentialDefaultCall);

  // The destination tab follows the selected status: the tab holding the default/selected destination, else the first.
  useEffect(() => {
    if (destinationTabs.length === 0) return;
    const preferred = effectiveDestination.type !== 'none' && destinationTabs.includes(effectiveDestination.type) ? effectiveDestination.type : destinationTabs[0];
    setDestinationTab(preferred);
    // Only when the status changes: later manual tab taps must win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, destinationTabs.length]);

  const finish = useCallback(
    (outcome: StatusSubmitOutcome) => {
      if (outcome === 'rejected') {
        setError(t('status.failed_to_save_status'));
        toast.error(t('status.failed_to_save_status'));
        return;
      }
      if (outcome === 'queued') toast.warning(t('status.status_queued'));
      else toast.success(t('status.status_saved_successfully'));
      onClose();
    },
    [onClose, t, toast]
  );

  const run = useCallback(
    async (submit: () => Promise<StatusSubmitOutcome>) => {
      if (pendingRef.current !== null) return;
      const id = ++counterRef.current;
      pendingRef.current = id;
      setIsSubmitting(true);
      setError(null);
      try {
        const outcome = await submit();
        if (pendingRef.current === id) finish(outcome);
      } catch (caught) {
        if (pendingRef.current === id) {
          const message = caught instanceof StatusSubmitError ? caught.message : t('status.failed_to_save_status');
          setError(message);
          toast.error(message);
        }
      } finally {
        if (pendingRef.current === id) {
          pendingRef.current = null;
          setIsSubmitting(false);
        }
      }
    },
    [finish, t, toast]
  );

  const submitStatus = useCallback(() => {
    if (!selectedStatus || isAwaitingDestinations) return;
    const destination = effectiveDestination;
    void run(() => onSubmitStatus({ status: selectedStatus, destination, ...toRespondingTo(destination), note: note.trim() }));
  }, [effectiveDestination, isAwaitingDestinations, note, onSubmitStatus, run, selectedStatus]);

  const submitStaffing = useCallback(() => {
    if (!selectedStaffing || !onSubmitStaffing) return;
    void run(() => onSubmitStaffing({ staffing: selectedStaffing, note: note.trim() }));
  }, [note, onSubmitStaffing, run, selectedStaffing]);

  // A completed hold acts once the status is selected and the lists it may default from have landed: it saves when
  // nothing else is needed, and otherwise opens the step that still needs the user.
  useEffect(() => {
    if (!isOpen || !holdPending || !selectedStatus || isSubmitting || isAwaitingDestinations) return;
    setHoldPending(false);
    if (canSubmitStatusWithoutInput(selectedStatus, { allowsCalls, hasDefaultCall: !!defaultCall })) {
      submitStatus();
      return;
    }
    setStep(hasDestinationStep ? 'destination' : 'note');
  }, [allowsCalls, defaultCall, hasDestinationStep, holdPending, isAwaitingDestinations, isOpen, isSubmitting, selectedStatus, submitStatus]);

  const handleSelectStatus = useCallback((option: StatusOption) => {
    setSelectedId(toOptionId(option.Id));
    setSelection(NO_DESTINATION);
    setHasExplicitChoice(false);
    setError(null);
  }, []);

  const handleHoldStatus = useCallback(
    (option: StatusOption) => {
      if (pendingRef.current !== null) return;
      handleSelectStatus(option);
      setIsHoldHintVisible(false);
      setHoldPending(true);
    },
    [handleSelectStatus]
  );

  const handleSelectStaffing = useCallback((option: StatusOption) => {
    setSelectedStaffingId(toOptionId(option.Id));
    setError(null);
  }, []);

  const handleSelectDestination = useCallback((destination: StatusDestination) => {
    setHasExplicitChoice(true);
    setSelection(destination);
  }, []);

  const handleClose = useCallback(() => {
    // Closing mid-submit would not cancel the save; like Cancel, it waits.
    if (pendingRef.current !== null) return;
    onClose();
  }, [onClose]);

  const noteRequired = isStaffingTab ? isNoteRequired(selectedStaffing) : isNoteRequired(selectedStatus);
  const optionHasNoteStep = isStaffingTab ? hasNoteStep(selectedStaffing) : hasNoteStep(selectedStatus);
  const isLastStep = step === 'note' || (step === 'destination' && !optionHasNoteStep) || (step === 'select' && (isStaffingTab ? !optionHasNoteStep : !hasDestinationStep && !optionHasNoteStep));
  const hasSelection = isStaffingTab ? !!selectedStaffing : !!selectedStatus;
  const canProceed = hasSelection && !isSubmitting && (step !== 'note' || !noteRequired || note.trim().length > 0) && (isStaffingTab || !isLastStep || !isAwaitingDestinations);

  const handleNext = useCallback(() => {
    if (!canProceed) return;
    if (isStaffingTab) {
      if (step === 'select' && optionHasNoteStep) setStep('note');
      else submitStaffing();
      return;
    }
    if (step === 'select' && hasDestinationStep) setStep('destination');
    else if (step !== 'note' && optionHasNoteStep) setStep('note');
    else submitStatus();
  }, [canProceed, hasDestinationStep, isStaffingTab, optionHasNoteStep, step, submitStaffing, submitStatus]);

  const handleBack = useCallback(() => {
    if (step === 'note' && !isStaffingTab && hasDestinationStep) setStep('destination');
    else setStep('select');
  }, [hasDestinationStep, isStaffingTab, step]);

  const title =
    step === 'destination'
      ? t('status.select_destination', { status: selectedStatus?.Text ?? '' })
      : step === 'note'
        ? t('status.add_note')
        : isStaffingTab
          ? t('status.select_staffing')
          : subject === 'unit'
            ? t('status.select_unit_status')
            : t('status.select_status');

  const isHoldMode = holdToConfirm && !isStaffingTab;

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={handleClose} snapPoints={[80]} testID={testID}>
      <VStack space="md" className="w-full flex-1">
        <VStack space="xs">
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          {isOnBehalf && subjectName ? (
            <Text className="text-sm text-typography-500" testID={`${testID}-on-behalf`}>
              {t('status.on_behalf_of', { name: subjectName })}
            </Text>
          ) : null}
        </VStack>

        {showStaffing && step === 'select' ? (
          <HStack space="sm">
            {(['status', 'staffing'] as const).map((value) => (
              <Pressable
                key={value}
                testID={`${testID}-tab-${value}`}
                onPress={() => setTab(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                className={`flex-1 items-center rounded-lg px-3 py-2 ${tab === value ? 'bg-primary-500' : 'bg-background-100'}`}
              >
                <Text className={`font-semibold ${tab === value ? 'text-typography-0' : 'text-typography-700'}`}>{value === 'status' ? t('status.status_tab') : t('status.staffing_tab')}</Text>
              </Pressable>
            ))}
          </HStack>
        ) : null}

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" testID={`${testID}-scroll`}>
          {step === 'select' ? (
            <VStack>
              {isStaffingTab ? (
                staffingOptions.length === 0 ? (
                  <Text className="py-4 text-center text-typography-500">{t('status.no_staffing_available')}</Text>
                ) : (
                  staffingOptions.map((option) => (
                    <StatusOptionRow
                      key={toOptionId(option.Id)}
                      option={option}
                      isSelected={toOptionId(option.Id) === selectedStaffingId}
                      isCurrent={toOptionId(option.Id) === currentStaffingId}
                      isHoldMode={false}
                      onSelect={handleSelectStaffing}
                      testIDPrefix="staffing"
                    />
                  ))
                )
              ) : offered.offered.length === 0 ? (
                <Text className="py-4 text-center text-typography-500">{t('status.no_statuses_available')}</Text>
              ) : (
                offered.offered.map((option) => (
                  <StatusOptionRow
                    key={toOptionId(option.Id)}
                    option={option}
                    isSelected={toOptionId(option.Id) === selectedId}
                    isCurrent={toOptionId(option.Id) === currentStatusId}
                    isHoldMode={isHoldMode}
                    isDisabled={isSubmitting}
                    onSelect={handleSelectStatus}
                    onHold={handleHoldStatus}
                    onHoldTap={() => setIsHoldHintVisible(true)}
                    testIDPrefix="status"
                  />
                ))
              )}
              {!isStaffingTab && offered.isRestricted ? (
                <Button variant="link" onPress={() => setShowAll(true)} testID={`${testID}-show-all`}>
                  <ButtonText>{t('status.show_all_statuses', { count: offered.hiddenCount })}</ButtonText>
                </Button>
              ) : null}
              {!isStaffingTab && hasNextRestriction ? (
                <Button variant="link" onPress={() => setShowAll(false)} testID={`${testID}-show-next`}>
                  <ButtonText>{t('status.show_next_statuses')}</ButtonText>
                </Button>
              ) : null}
              {isHoldMode && isHoldHintVisible ? (
                <Text className="text-center text-sm text-typography-600" testID={`${testID}-hold-hint`} accessibilityLiveRegion="polite">
                  {t('status.hold_to_set_hint')}
                </Text>
              ) : null}
            </VStack>
          ) : null}

          {step === 'destination' && selectedStatus ? (
            <StatusDestinationList
              tabs={destinationTabs}
              activeTab={destinationTab}
              onTabChange={setDestinationTab}
              lists={destinations}
              selected={effectiveDestination}
              isLoading={isLoadingDestinations}
              onSelect={handleSelectDestination}
            />
          ) : null}

          {step === 'note' ? (
            <VStack space="sm">
              <Text className="text-sm text-typography-600">{noteRequired ? t('status.note_required') : t('status.note_optional')}</Text>
              <Textarea size="md" className="min-h-[100px]">
                <TextareaInput testID={`${testID}-note-input`} value={note} onChangeText={setNote} placeholder={t('status.note')} accessibilityLabel={t('status.note')} />
              </Textarea>
            </VStack>
          ) : null}
        </ScrollView>

        {step !== 'select' && !isStaffingTab && selectedStatus ? (
          <VStack className="rounded-lg bg-background-50 p-3" testID={`${testID}-summary`}>
            <Text className="text-sm text-typography-700">{`${t('status.selected_status')}: ${selectedStatus.Text}`}</Text>
            <Text className="text-sm text-typography-700">{`${t('status.selected_destination')}: ${effectiveDestination.type === 'none' ? t('status.no_destination') : destinationLabel(effectiveDestination)}`}</Text>
          </VStack>
        ) : null}

        {error ? (
          <Text className="rounded-lg bg-error-50 px-3 py-2 text-center text-error-600" testID={`${testID}-error`} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {isHoldMode && step === 'select' ? null : (
          <HStack space="md">
            {step === 'select' ? (
              <Button variant="outline" action="secondary" className="flex-1" onPress={handleClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
                <ButtonText>{t('common.cancel')}</ButtonText>
              </Button>
            ) : (
              <Button variant="outline" action="secondary" className="flex-1" onPress={handleBack} isDisabled={isSubmitting} testID={`${testID}-back`}>
                <ButtonText>{t('common.back')}</ButtonText>
              </Button>
            )}
            <Button className="flex-1" onPress={handleNext} isDisabled={!canProceed} testID={isLastStep ? `${testID}-submit` : `${testID}-next`}>
              {isSubmitting ? <Spinner size="small" /> : <ButtonText>{isLastStep ? t('status.set_status') : t('common.next')}</ButtonText>}
            </Button>
          </HStack>
        )}
      </VStack>
    </CustomBottomSheet>
  );
};
