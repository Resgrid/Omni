import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { ResourceAssignment } from '@resgrid/models';
import { Button, ButtonText, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { resourceKindName } from '../../lib/labels';
import { SheetForm } from './sheet-form';

export interface ResourceSheetProps {
  assignment: ResourceAssignment | null;
  onClose: () => void;
  resourceName: string;
  laneName: string;
  canAssign: boolean;
  onMoveToPool: (assignment: ResourceAssignment) => void;
  onRelease: (assignment: ResourceAssignment) => void;
  /** Opens the resource on the map when its position is known. */
  onShowOnMap?: (assignment: ResourceAssignment) => void;
}

/** One resource on the incident (IC resource-details sheet): where it is, since when, and remove-from-lane / release. */
export const ResourceSheet: React.FC<ResourceSheetProps> = ({ assignment, onClose, resourceName, laneName, canAssign, onMoveToPool, onRelease, onShowOnMap }) => {
  const { t } = useTranslation();
  return (
    <SheetForm isOpen={!!assignment} onClose={onClose} title={resourceName} snapPoint={55} testID="resource-sheet">
      {assignment ? (
        <VStack space="xs">
          <Text className="text-sm text-typography-500">{resourceKindName(t, assignment.ResourceKind)}</Text>
          <Text className="text-sm text-typography-900">{t('incident_command.resource_lane', { lane: laneName })}</Text>
          <Text className="text-sm text-typography-900">{t('incident_command.resource_assigned_on', { time: formatUtcInDepartmentTime(assignment.AssignedOn, null) })}</Text>
          {assignment.RequirementsWarning && assignment.RequirementsWarningMessage ? (
            <Text className="text-sm text-warning-700" testID="resource-sheet-warning">
              {assignment.RequirementsWarningMessage}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {onShowOnMap ? (
              <Button variant="outline" className="mb-2" onPress={() => onShowOnMap(assignment)} testID="resource-sheet-map">
                <ButtonText>{t('incident_command.show_on_map')}</ButtonText>
              </Button>
            ) : null}
            {canAssign && assignment.CommandStructureNodeId ? (
              <Button variant="outline" className="mb-2" onPress={() => onMoveToPool(assignment)} testID="resource-sheet-pool">
                <ButtonText>{t('incident_command.remove_from_lane')}</ButtonText>
              </Button>
            ) : null}
            {canAssign ? (
              <Button action="negative" onPress={() => onRelease(assignment)} testID="resource-sheet-release">
                <ButtonText>{t('incident_command.release_resource')}</ButtonText>
              </Button>
            ) : null}
          </View>
        </VStack>
      ) : null}
    </SheetForm>
  );
};

const styles = StyleSheet.create({
  actions: { marginTop: 16 },
});
