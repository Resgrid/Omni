import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData, PoiTypeResultData } from '@resgrid/models';
import { Map as MapIcon, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, type ListRenderItem, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ALL_POI_TYPES, filterAndSortPois, getPoiDisplayName, type PoiSortOption } from '../lib/poi';
import { useMapTheme } from '../provider/context';
import { MapSheet } from '../provider/overlays';
import { PoiMarkerIcon } from './poi-markers';
import { SheetButton, SheetHeader } from './sheet-parts';

/** POI list and filter (baseline Responder poi-list-panel + poi-filter-bottom-sheet), data passed in by the feature. */

export interface PoiFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  poiTypes: readonly PoiTypeResultData[];
  selectedPoiType: string;
  onPoiTypeChange: (value: string) => void;
  sortBy: PoiSortOption;
  onSortByChange: (value: PoiSortOption) => void;
}

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; testID?: string }> = ({ label, selected, onPress, testID }) => {
  const { colors } = useMapTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={StyleSheet.flatten([styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }])}
      testID={testID}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text }}>{label}</Text>
    </Pressable>
  );
};

export const PoiFilterSheet: React.FC<PoiFilterSheetProps> = ({ isOpen, onClose, poiTypes, selectedPoiType, onPoiTypeChange, sortBy, onSortByChange }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const reset = useCallback(() => {
    onPoiTypeChange(ALL_POI_TYPES);
    onSortByChange('name');
  }, [onPoiTypeChange, onSortByChange]);
  return (
    <MapSheet isOpen={isOpen} onClose={onClose} snapPoints={[60]} testID="poi-filter-sheet">
      <SheetHeader title={t('maps.poi.filter_title')} onClose={onClose} closeLabel={t('common.close')} testID="poi-filter" />
      <Text style={StyleSheet.flatten([styles.label, { color: colors.text }])}>{t('maps.poi.type')}</Text>
      <View style={styles.chips}>
        <Chip label={t('maps.poi.all_types')} selected={selectedPoiType === ALL_POI_TYPES} onPress={() => onPoiTypeChange(ALL_POI_TYPES)} testID="poi-filter-type-all" />
        {poiTypes.map((poiType) => (
          <Chip
            key={poiType.PoiTypeId}
            label={poiType.Name}
            selected={selectedPoiType === String(poiType.PoiTypeId)}
            onPress={() => onPoiTypeChange(String(poiType.PoiTypeId))}
            testID={`poi-filter-type-${poiType.PoiTypeId}`}
          />
        ))}
      </View>
      <Text style={StyleSheet.flatten([styles.label, { color: colors.text }])}>{t('maps.poi.sort_by')}</Text>
      <View style={styles.chips}>
        <Chip label={t('maps.poi.sort_name')} selected={sortBy === 'name'} onPress={() => onSortByChange('name')} testID="poi-filter-sort-name" />
        <Chip label={t('maps.poi.sort_type')} selected={sortBy === 'type'} onPress={() => onSortByChange('type')} testID="poi-filter-sort-type" />
      </View>
      <SheetButton label={t('maps.poi.reset')} onPress={reset} testID="poi-filter-reset" />
      <SheetButton label={t('common.done')} onPress={onClose} variant="solid" testID="poi-filter-done" />
    </MapSheet>
  );
};

export interface PoiListProps {
  pois: readonly PoiResultData[];
  poiTypes?: readonly PoiTypeResultData[];
  onPoiPress?: (poi: PoiResultData) => void;
  onViewOnMap?: (poi: PoiResultData) => void;
  testID?: string;
}

export const PoiList: React.FC<PoiListProps> = ({ pois, poiTypes = [], onPoiPress, onViewOnMap, testID = 'poi-list' }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const [search, setSearch] = useState('');
  const [poiTypeId, setPoiTypeId] = useState(ALL_POI_TYPES);
  const [sortBy, setSortBy] = useState<PoiSortOption>('name');
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = useMemo(() => filterAndSortPois(pois, { poiTypeId, sortBy, search }), [pois, poiTypeId, sortBy, search]);
  const hasFilters = poiTypeId !== ALL_POI_TYPES || sortBy !== 'name';

  const renderItem = useCallback<ListRenderItem<PoiResultData>>(
    ({ item }) => (
      <Pressable onPress={() => onPoiPress?.(item)} style={StyleSheet.flatten([styles.item, { borderColor: colors.border }])} accessibilityRole="button" testID={`${testID}-item-${item.PoiId}`}>
        <PoiMarkerIcon color={item.Color} iconUrl={item.IconUrl} />
        <View style={styles.itemText}>
          <Text style={StyleSheet.flatten([styles.itemTitle, { color: colors.text }])} numberOfLines={1}>
            {getPoiDisplayName(item)}
          </Text>
          {item.PoiTypeName ? <Text style={{ color: colors.mutedText }}>{item.PoiTypeName}</Text> : null}
          {item.Address ? (
            <Text style={{ color: colors.mutedText }} numberOfLines={1}>
              {item.Address}
            </Text>
          ) : null}
        </View>
        {onViewOnMap ? (
          <Pressable onPress={() => onViewOnMap(item)} accessibilityRole="button" accessibilityLabel={t('maps.poi.view_on_map')} hitSlop={8} testID={`${testID}-map-${item.PoiId}`}>
            <View>
              <MapIcon size={20} color={colors.primary} />
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    ),
    [colors, onPoiPress, onViewOnMap, t, testID]
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('maps.poi.search_placeholder')}
          placeholderTextColor={colors.mutedText}
          style={StyleSheet.flatten([styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }])}
          accessibilityLabel={t('common.search')}
          testID={`${testID}-search`}
        />
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('maps.poi.filter_title')}
          style={StyleSheet.flatten([styles.filterButton, { borderColor: hasFilters ? colors.primary : colors.border }])}
          testID={`${testID}-filter`}
        >
          <View>
            <SlidersHorizontal size={18} color={hasFilters ? colors.primary : colors.mutedText} />
          </View>
        </Pressable>
      </View>
      <Text style={StyleSheet.flatten([styles.count, { color: colors.mutedText }])} testID={`${testID}-count`}>
        {t('maps.poi.results', { count: filtered.length })}
      </Text>
      {filtered.length > 0 ? (
        <FlatList data={filtered} keyExtractor={(item) => String(item.PoiId)} renderItem={renderItem} />
      ) : (
        <Text style={StyleSheet.flatten([styles.empty, { color: colors.mutedText }])} testID={`${testID}-empty`}>
          {t('pois.empty_description')}
        </Text>
      )}
      <PoiFilterSheet isOpen={filterOpen} onClose={() => setFilterOpen(false)} poiTypes={poiTypes} selectedPoiType={poiTypeId} onPoiTypeChange={setPoiTypeId} sortBy={sortBy} onSortByChange={setSortBy} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  search: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterButton: {
    width: 40,
    height: 40,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  count: {
    marginVertical: 8,
    fontSize: 13,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: {
    flex: 1,
    marginHorizontal: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    marginTop: 24,
    textAlign: 'center',
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
});
