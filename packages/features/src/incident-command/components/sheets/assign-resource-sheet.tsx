import { useTranslation } from '@resgrid/i18n';
import { ResourceAssignmentKind } from '@resgrid/models';
import { Badge, BadgeText, HStack, Input, InputField, Pressable, Text, TypeIcon, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';

import type { AssignableResource } from '../../hooks/use-board-roster';
import { isDepartmentPersonnelKind, isUnitKind } from '../../lib/board';
import { ChoiceChips } from './choice-chips';
import { SheetForm } from './sheet-form';

type KindFilter = 'units' | 'personnel' | 'adhoc';

export interface AssignResourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  options: AssignableResource[];
  /** Target lane id; '' = track on the incident without a lane (the pool). */
  targetNodeId: string;
  targetLabel: string;
  laneName: (nodeId: string) => string;
  onSelect: (option: AssignableResource) => void;
}

const MAX_ROWS = 100;

const matchesKind = (option: AssignableResource, filter: KindFilter): boolean =>
  filter === 'adhoc'
    ? option.kind === ResourceAssignmentKind.AdHocUnit || option.kind === ResourceAssignmentKind.AdHocPersonnel
    : filter === 'units'
      ? isUnitKind(option.kind) && option.kind !== ResourceAssignmentKind.AdHocUnit
      : isDepartmentPersonnelKind(option.kind);

/** Pick a unit, member or ad-hoc resource for a lane or the pool (IC assign-resource sheet), showing where each one is now. */
export const AssignResourceSheet: React.FC<AssignResourceSheetProps> = ({ isOpen, onClose, options, targetNodeId, targetLabel, laneName, onSelect }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KindFilter>('units');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFilter('units');
    }
  }, [isOpen]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return options
      .filter((option) => matchesKind(option, filter))
      .filter((option) => !normalized || option.name.toLocaleLowerCase().includes(normalized) || option.detail.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS);
  }, [filter, options, query]);

  return (
    <SheetForm isOpen={isOpen} onClose={onClose} title={t('incident_command.assign_resource_title')} description={targetLabel} snapPoint={85} testID="assign-resource-sheet">
      <ChoiceChips
        choices={[
          { value: 'units' as KindFilter, label: t('incident_command.filter_units') },
          { value: 'personnel' as KindFilter, label: t('incident_command.filter_personnel') },
          { value: 'adhoc' as KindFilter, label: t('incident_command.filter_adhoc') },
        ]}
        selected={filter}
        onSelect={setFilter}
        accessibilityLabel={t('incident_command.resource_filter')}
        testID="assign-resource-filter"
      />
      <Input size="md" variant="outline" className="mb-2">
        <InputField value={query} onChangeText={setQuery} placeholder={t('incident_command.search_resources')} accessibilityLabel={t('incident_command.search_resources')} testID="assign-resource-search" />
      </Input>
      {rows.length === 0 ? (
        <Text className="py-4 text-center text-sm text-typography-500" testID="assign-resource-empty">
          {t('incident_command.no_resources_found')}
        </Text>
      ) : (
        <VStack space="xs">
          {rows.map((option) => {
            const isHere = option.assignedNodeId !== undefined && option.assignedNodeId === targetNodeId;
            return (
              <Pressable
                key={`${option.kind}-${option.id}`}
                onPress={() => onSelect(option)}
                disabled={isHere}
                accessibilityRole="button"
                accessibilityState={{ disabled: isHere }}
                accessibilityLabel={option.name}
                className={`rounded-lg border border-outline-100 px-3 py-2 ${isHere ? 'opacity-50' : ''}`}
                testID={`assign-resource-option-${option.kind}-${option.id}`}
              >
                <HStack className="items-center" space="sm">
                  {option.typeIconUrl || option.typeMapIcon ? <TypeIcon iconUrl={option.typeIconUrl} mapIcon={option.typeMapIcon} size={24} /> : null}
                  <VStack className="min-w-0 flex-1">
                    <Text className="font-medium text-typography-900" numberOfLines={1}>
                      {option.name}
                    </Text>
                    {option.detail || option.statusLabel ? (
                      <Text className="text-xs text-typography-500" numberOfLines={1}>
                        {[option.statusLabel, option.detail].filter(Boolean).join(' • ')}
                      </Text>
                    ) : null}
                  </VStack>
                  {option.assignedNodeId !== undefined ? (
                    <Badge action={isHere ? 'success' : 'info'} size="sm">
                      <BadgeText>{option.assignedNodeId ? laneName(option.assignedNodeId) : t('incident_command.unassigned_pool')}</BadgeText>
                    </Badge>
                  ) : null}
                </HStack>
              </Pressable>
            );
          })}
        </VStack>
      )}
    </SheetForm>
  );
};
