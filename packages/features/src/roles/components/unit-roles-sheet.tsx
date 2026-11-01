import { selectUnitById, usePersonnelStore, useUnitRolesStore, useUnitsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type ActiveUnitRoleResultData, type UnitRoleResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, ScrollView, Spinner, Text, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { applyAssignment, buildSetUnitRolesInput, effectiveUserIdFor, getEffectiveAssignments, type PendingAssignment } from '../lib/role-assignments';
import { RoleAssignmentItem } from './role-assignment-item';

export interface UnitRolesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Defaults to the active unit from the StatusProvider (Unit). */
  unitId?: string | null;
}

const NO_SEATS: UnitRoleResultData[] = [];
const NO_ASSIGNMENTS: ActiveUnitRoleResultData[] = [];

/**
 * Crew seats for a unit (Unit baseline): who sits where, changed as pending picks and saved together. Saving is online
 * only (`SetRoleAssignmentsForUnit`); a failure is shown inside the sheet — it is its own native window, where a toast
 * underneath would be missed — and the picks stay so Save retries them.
 */
export const UnitRolesSheet: React.FC<UnitRolesSheetProps> = ({ isOpen, onClose, unitId: unitIdProp }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { activeUnitId } = useStatusContext();
  const unitId = unitIdProp ?? activeUnitId;

  const unit = useUnitsStore((state) => (unitId ? selectUnitById(state, unitId) : undefined));
  const seatsForUnit = useUnitRolesStore((state) => (unitId ? state.rolesByUnit[unitId] : undefined));
  const departmentSeats = useUnitRolesStore((state) => state.roles);
  const server = useUnitRolesStore((state) => (unitId ? (state.assignmentsByUnit[unitId] ?? NO_ASSIGNMENTS) : NO_ASSIGNMENTS));
  const isLoading = useUnitRolesStore((state) => state.loading.unitRoles === true || state.loading.assignments === true);
  const users = usePersonnelStore((state) => state.personnel);

  const [pending, setPending] = useState<PendingAssignment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !unitId) return;
    setPending([]);
    setSaveError(null);
    void useUnitRolesStore.getState().fetchAllForUnit(unitId, { bypassCache: true });
    if (usePersonnelStore.getState().personnel.length === 0) void usePersonnelStore.getState().fetchPersonnel();
  }, [isOpen, unitId]);

  const seats = useMemo<UnitRoleResultData[]>(() => {
    if (seatsForUnit && seatsForUnit.length > 0) return seatsForUnit;
    return unitId ? departmentSeats.filter((seat) => seat.UnitId === unitId) : NO_SEATS;
  }, [departmentSeats, seatsForUnit, unitId]);
  const assignments = useMemo(() => getEffectiveAssignments(seats, pending, server), [pending, seats, server]);

  const handleAssign = useCallback(
    (roleId: string, userId?: string) => {
      setSaveError(null);
      setPending((current) => applyAssignment(current, server, roleId, userId));
    },
    [server]
  );

  const handleSave = useCallback(async () => {
    if (!unitId || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await useUnitRolesStore.getState().assignRoles(buildSetUnitRolesInput(unitId, seats, pending, server));
      toast.success(t('roles.saved_successfully'));
      setPending([]);
      onClose();
    } catch {
      setSaveError(t('roles.save_error'));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onClose, pending, seats, server, t, toast, unitId]);

  const sheetOpen = isOpen && !!unitId;

  const handleClose = useCallback(() => {
    if (isSaving) return;
    setPending([]);
    onClose();
  }, [isSaving, onClose]);

  return (
    <CustomBottomSheet isOpen={sheetOpen} onClose={handleClose} snapPoints={[80]} testID="unit-roles-sheet">
      <VStack space="md" className="w-full flex-1">
        <HStack className="items-center justify-between">
          <Text className="text-xl font-bold text-typography-900">{t('roles.modal.title')}</Text>
          {unit ? <Text className="text-sm text-typography-500">{unit.Name}</Text> : null}
        </HStack>

        <ScrollView className="flex-1" testID="unit-roles-scroll">
          {isLoading && seats.length === 0 ? (
            <Spinner />
          ) : seats.length === 0 ? (
            <Text className="py-6 text-center text-typography-500">{t('roles.no_roles')}</Text>
          ) : (
            <VStack space="sm" className="pb-4">
              {seats.map((seat) => {
                const userId = effectiveUserIdFor(seat.UnitRoleId, pending, server);
                return (
                  <RoleAssignmentItem
                    key={seat.UnitRoleId}
                    seat={seat}
                    assignedUser={userId ? users.find((user) => user.UserId === userId) : undefined}
                    users={users}
                    onAssignUser={(next) => handleAssign(seat.UnitRoleId, next)}
                    currentAssignments={assignments}
                  />
                );
              })}
            </VStack>
          )}
        </ScrollView>

        {saveError ? (
          <Text className="rounded-lg bg-error-50 px-3 py-2 text-center text-error-600" testID="unit-roles-save-error" accessibilityRole="alert">
            {saveError}
          </Text>
        ) : null}

        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={handleClose} isDisabled={isSaving} testID="unit-roles-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={handleSave} isDisabled={isSaving || pending.length === 0} testID="unit-roles-save">
            {isSaving ? <Spinner size="small" /> : <ButtonText>{t('common.save')}</ButtonText>}
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
