import { useTranslation } from '@resgrid/i18n';
import { CommandNodeType, type CommandStructureNode } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LaneInput } from '../../lib/events';
import { COMMAND_NODE_TYPES, LANE_COLORS, nodeTypeName } from '../../lib/labels';
import { ChoiceChips } from './choice-chips';
import { FieldLabel, parseCount, SheetForm, TextField } from './sheet-form';

export type LaneDeleteDisposition = 'pool' | 'release';

export interface LaneSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Editing an existing lane; null adds one. */
  node: CommandStructureNode | null;
  /** Other lanes a new lane can sit under (Branch → Division …). */
  parents: CommandStructureNode[];
  /** Resources in the lane being edited (asks what happens to them on delete). */
  resourceCount: number;
  onSave: (input: Omit<LaneInput, 'sortOrder'>) => void;
  onDelete?: (disposition: LaneDeleteDisposition) => void;
}

/** Add or edit a lane (IC add-lane + lane-details sheets): name, ICS type, colour, unit limits, rotation time; delete. */
export const LaneSheet: React.FC<LaneSheetProps> = ({ isOpen, onClose, node, parents, resourceCount, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [nodeType, setNodeType] = useState<number>(CommandNodeType.Division);
  const [color, setColor] = useState<string | null>(null);
  const [minUnits, setMinUnits] = useState('');
  const [maxUnits, setMaxUnits] = useState('');
  const [maxTime, setMaxTime] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(node?.Name ?? '');
    setNodeType(node?.NodeType ?? CommandNodeType.Division);
    setColor(node?.Color ?? null);
    setMinUnits(node?.MinUnits ? String(node.MinUnits) : '');
    setMaxUnits(node?.MaxUnits ? String(node.MaxUnits) : '');
    setMaxTime(node?.MaxTimeInRole ? String(node.MaxTimeInRole) : '');
    setParentId(node?.ParentNodeId ?? '');
    setConfirmDelete(false);
  }, [isOpen, node]);

  const submit = () => {
    if (!name.trim()) return;
    onSave({ name, nodeType, color, minUnits: parseCount(minUnits), maxUnits: parseCount(maxUnits), maxTimeInRole: parseCount(maxTime), parentNodeId: parentId || null });
  };

  const parentChoices = [
    { value: '', label: t('incident_command.lane_parent_none') },
    ...parents.filter((parent) => parent.CommandStructureNodeId !== node?.CommandStructureNodeId).map((parent) => ({ value: parent.CommandStructureNodeId, label: parent.Name })),
  ];

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={node ? t('incident_command.edit_lane_title') : t('incident_command.add_lane')}
      submitLabel={t('common.save')}
      onSubmit={submit}
      isSubmitDisabled={!name.trim()}
      testID="lane-sheet"
    >
      <TextField label={t('incident_command.lane_name')} value={name} onChangeText={setName} placeholder={t('incident_command.lane_name_placeholder')} testID="lane-sheet-name" />
      <FieldLabel text={t('incident_command.lane_type')} />
      <ChoiceChips
        choices={COMMAND_NODE_TYPES.map((type) => ({ value: type as number, label: nodeTypeName(t, type) }))}
        selected={nodeType}
        onSelect={setNodeType}
        accessibilityLabel={t('incident_command.lane_type')}
        testID="lane-sheet-type"
      />
      <FieldLabel text={t('incident_command.lane_color')} optional />
      <ChoiceChips
        choices={[{ value: '', label: t('incident_command.lane_color_none') }, ...LANE_COLORS.map((value) => ({ value, label: value, color: value }))]}
        selected={color ?? ''}
        onSelect={(value) => setColor(value || null)}
        accessibilityLabel={t('incident_command.lane_color')}
        testID="lane-sheet-color"
      />
      {parentChoices.length > 1 ? (
        <>
          <FieldLabel text={t('incident_command.lane_parent')} optional />
          <ChoiceChips choices={parentChoices} selected={parentId} onSelect={setParentId} accessibilityLabel={t('incident_command.lane_parent')} testID="lane-sheet-parent" />
        </>
      ) : null}
      <View style={styles.row}>
        <View style={styles.cell}>
          <TextField label={t('incident_command.lane_min_units')} value={minUnits} onChangeText={setMinUnits} keyboardType="number-pad" optional testID="lane-sheet-min-units" />
        </View>
        <View style={styles.cell}>
          <TextField label={t('incident_command.lane_max_units')} value={maxUnits} onChangeText={setMaxUnits} keyboardType="number-pad" optional testID="lane-sheet-max-units" />
        </View>
      </View>
      <TextField label={t('incident_command.lane_max_time')} value={maxTime} onChangeText={setMaxTime} keyboardType="number-pad" optional testID="lane-sheet-max-time" />

      {node && onDelete ? (
        <View style={styles.delete}>
          {confirmDelete ? (
            <View testID="lane-sheet-delete-confirm">
              <Text className="mb-2 text-sm text-typography-700">{resourceCount > 0 ? t('incident_command.delete_lane_with_resources', { count: resourceCount }) : t('incident_command.delete_lane_confirm')}</Text>
              {resourceCount > 0 ? (
                <View style={styles.row}>
                  <Button variant="outline" className="mr-2 flex-1" onPress={() => onDelete('pool')} testID="lane-sheet-delete-pool">
                    <ButtonText>{t('incident_command.delete_lane_to_pool')}</ButtonText>
                  </Button>
                  <Button action="negative" className="flex-1" onPress={() => onDelete('release')} testID="lane-sheet-delete-release">
                    <ButtonText>{t('incident_command.delete_lane_release')}</ButtonText>
                  </Button>
                </View>
              ) : (
                <Button action="negative" onPress={() => onDelete('pool')} testID="lane-sheet-delete-confirm-button">
                  <ButtonText>{t('incident_command.delete_lane')}</ButtonText>
                </Button>
              )}
            </View>
          ) : (
            <Button variant="outline" action="negative" onPress={() => setConfirmDelete(true)} testID="lane-sheet-delete">
              <ButtonText>{t('incident_command.delete_lane')}</ButtonText>
            </Button>
          )}
        </View>
      ) : null}
    </SheetForm>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1, marginRight: 8 },
  delete: { marginTop: 20 },
});
