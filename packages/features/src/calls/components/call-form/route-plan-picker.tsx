import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { routePlansRoutes } from '@resgrid/features/route-plans/routes';
import { useTranslation } from '@resgrid/i18n';
import type { CallRoutePlanResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, Input, InputField, InputIcon, InputSlot, Pressable, Text, useThemeColors } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, Eye, Route, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { callRoutePlanEndpoints, callRoutePlanSummary, filterCallRoutePlans } from '../../lib/call-route';
import { CallModalFrame } from '../call-modal-frame';

/** A plan's colour swatch; the department's colour when it set one. */
const DEFAULT_ROUTE_COLOR = '#3b82f6';

export interface RoutePlanPickerProps {
  isOpen: boolean;
  onClose: () => void;
  plans: readonly CallRoutePlanResultData[];
  selectedId: string | null;
  onSelect: (plan: CallRoutePlanResultData) => void;
}

/** Picks one of the routes a call may run (`Routes/GetCallRoutePlans`): name, stops, distance, time, start and end. */
export const RoutePlanPicker: React.FC<RoutePlanPickerProps> = ({ isOpen, onClose, plans, selectedId, onSelect }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterCallRoutePlans(plans, query), [plans, query]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const renderItem = useCallback(
    ({ item }: { item: CallRoutePlanResultData }) => {
      const isSelected = item.RoutePlanId === selectedId;
      const summary = callRoutePlanSummary(item, t);
      const endpoints = callRoutePlanEndpoints(item, t);

      return (
        <Pressable
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={[item.Name, summary, endpoints].filter((part) => !!part).join(', ')}
          accessibilityState={{ selected: isSelected }}
          testID={`call-route-plan-${item.RoutePlanId}`}
          className="flex-row items-center border-b border-outline-100 px-4 py-3"
        >
          <View style={StyleSheet.flatten([styles.swatch, { backgroundColor: item.RouteColor || DEFAULT_ROUTE_COLOR }])} />
          <View style={styles.rowText}>
            <Text className="font-medium text-typography-900">{item.Name}</Text>
            {summary ? (
              <Text size="xs" className="text-typography-600">
                {summary}
              </Text>
            ) : null}
            <Text size="xs" className="text-typography-500">
              {endpoints}
            </Text>
          </View>
          {isSelected ? (
            <View>
              <Check size={18} color={colors.primary} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors.primary, onSelect, selectedId, t]
  );

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.route_select')} scrollable={false} testID="call-route-picker">
      <View style={styles.search}>
        <Input variant="outline" size="sm">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField value={query} onChangeText={setQuery} placeholder={t('calls.route_search')} accessibilityLabel={t('calls.route_search')} testID="call-route-search" />
        </Input>
      </View>
      {visible.length === 0 ? (
        <Text className="py-4 text-center text-typography-500" testID="call-route-empty">
          {t('calls.route_none_found')}
        </Text>
      ) : (
        <FlatList data={visible} keyExtractor={(plan: CallRoutePlanResultData) => plan.RoutePlanId} renderItem={renderItem} keyboardShouldPersistTaps="handled" testID="call-route-list" />
      )}
    </CallModalFrame>
  );
};

export interface RoutePlanFieldProps {
  /** The routes a call may run (the routes store's `callRoutePlans`). */
  plans: readonly CallRoutePlanResultData[];
  selectedId: string | null;
  /** The name to show for a picked route that is not in `plans` (any more), e.g. the call's `RoutePlanName`. */
  fallbackName?: string | null;
  onChange: (plan: CallRoutePlanResultData | null) => void;
  label: string;
  /** Explains what picking a route does (shown under the field). */
  hint?: string | null;
  testID?: string;
}

/**
 * The Route field of the call form and the recurring call form (Core M0322): the picked route with its stops, distance,
 * time, start and end, a button to clear it and, where the app previews routes (`routes.preview`), a link to its preview
 * (`/route-plans/[id]`, map and stops). Shown only when the department has a route a call may run (or one is picked).
 */
export const RoutePlanField: React.FC<RoutePlanFieldProps> = ({ plans, selectedId, fallbackName = null, onChange, label, hint = null, testID = 'call-form-route' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const routes = useCapability('routes');
  const [isOpen, setIsOpen] = useState(false);
  const selected = selectedId ? (plans.find((plan) => plan.RoutePlanId === selectedId) ?? null) : null;
  // No route picked shows no name: the fallback names only a picked route that `plans` lacks.
  const name = selectedId ? selected?.Name || fallbackName?.trim() || t('calls.route_unknown') : '';
  const previewPath = selectedId && routes.preview ? routePlansRoutes.preview(selectedId) : null;

  return (
    <View style={styles.field} testID={`${testID}-field`}>
      <Text size="sm" className="mb-1 text-typography-700">
        {label}
      </Text>
      <View style={styles.inputRow}>
        <Pressable
          onPress={() => setIsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={name ? `${label}: ${name}` : t('calls.route_select')}
          testID={testID}
          className="flex-1 flex-row items-center rounded border border-outline-300 px-3 py-2"
        >
          <View style={styles.icon}>
            <Route size={16} color={colors.icon} />
          </View>
          <Text className={name ? 'flex-1 text-typography-900' : 'flex-1 text-typography-400'} numberOfLines={1}>
            {name || t('calls.route_select')}
          </Text>
          <View>
            <ChevronDown size={16} color={colors.icon} />
          </View>
        </Pressable>
        {selectedId ? (
          <Button variant="outline" size="sm" className="ml-2" onPress={() => onChange(null)} accessibilityLabel={t('calls.route_clear')} testID={`${testID}-clear`}>
            <View>
              <X size={16} color={colors.icon} />
            </View>
          </Button>
        ) : null}
      </View>
      {selected ? (
        <View style={styles.summary} testID={`${testID}-summary`}>
          <Text size="xs" className="text-typography-600">
            {callRoutePlanSummary(selected, t)}
          </Text>
          <Text size="xs" className="text-typography-500" testID={`${testID}-endpoints`}>
            {callRoutePlanEndpoints(selected, t)}
          </Text>
        </View>
      ) : null}
      {previewPath ? (
        <Button variant="link" size="sm" className="self-start" onPress={() => pushRoutePath(router, previewPath)} accessibilityLabel={t('route_plans.preview_action')} testID={`${testID}-preview`}>
          <View style={styles.icon}>
            <Eye size={14} color={colors.primary} />
          </View>
          <ButtonText>{t('route_plans.preview_action')}</ButtonText>
        </Button>
      ) : null}
      {hint ? (
        <Text size="xs" className="mt-1 text-typography-500">
          {hint}
        </Text>
      ) : null}
      <RoutePlanPicker
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        plans={plans}
        selectedId={selectedId}
        onSelect={(plan) => {
          onChange(plan);
          setIsOpen(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  field: { marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 6 },
  summary: { marginTop: 4 },
  swatch: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rowText: { flex: 1 },
});
