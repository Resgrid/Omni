import { UnitNavigationEtaChip, useIsNavigationEtaEnabled, useNavigationEtaSync } from '@resgrid/features/navigation-eta';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Button, ButtonText, Text, TypeIcon, useThemeColors } from '@resgrid/ui';
import { UserPlus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { dispatchKey, getDispatchTypeStyle, getUniqueDispatches, isUnitDispatchType } from '../../lib/call-dispatch';

export interface CallDispatchedPanelProps {
  dispatches: readonly DispatchedEventResultData[];
  /** The call shown: dispatched units navigating to it get their live ETA (apps that show ETAs). */
  callId?: string | null;
  /** "Dispatch more" (Dispatch): shown for a call already out to users who may dispatch. */
  onDispatchMore?: () => void;
}

/**
 * Who the call was dispatched to (personnel, groups, roles, units), with response codes when the department shows them
 * and, where the app shows live ETAs (Dispatch, Big Board), each unit's ETA while it navigates to this call.
 */
export const CallDispatchedPanel: React.FC<CallDispatchedPanelProps> = ({ dispatches, callId = null, onDispatchMore }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const unique = useMemo(() => getUniqueDispatches(dispatches), [dispatches]);
  const showEtas = useIsNavigationEtaEnabled() && !!callId;
  useNavigationEtaSync(showEtas);

  const dispatchMore = onDispatchMore ? (
    <Button size="sm" className="mb-3 self-start" onPress={onDispatchMore} accessibilityLabel={t('call_detail.dispatch_more')} testID="call-dispatched-dispatch-more">
      <View style={styles.buttonIcon}>
        <UserPlus size={16} color={colors.textInverse} />
      </View>
      <ButtonText>{t('call_detail.dispatch_more')}</ButtonText>
    </Button>
  ) : null;

  if (unique.length === 0) {
    return (
      <View style={styles.panel} testID="call-dispatched-panel">
        {dispatchMore}
        <Text className="text-typography-600">{t('call_detail.no_dispatched')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel} testID="call-dispatched-panel">
      {dispatchMore}
      {unique.map((dispatch, index) => {
        const style = getDispatchTypeStyle(dispatch.Type);
        const isUnit = isUnitDispatchType(dispatch.Type);

        return (
          <View key={dispatchKey(dispatch)} style={styles.row} className="bg-background-50" testID={`call-dispatched-${dispatch.Id || index}`}>
            <View style={StyleSheet.flatten([styles.badge, { backgroundColor: style.backgroundColor }])}>
              <Text style={StyleSheet.flatten([styles.badgeText, { color: style.textColor }])}>{style.label}</Text>
            </View>
            {isUnit ? (
              <View style={styles.icon}>
                <TypeIcon iconUrl={dispatch.TypeIconUrl} mapIcon={dispatch.TypeMapIcon} size={20} />
              </View>
            ) : null}
            <View style={styles.body}>
              <Text className="font-semibold text-typography-900">{dispatch.Name}</Text>
              <Text size="xs" className="text-typography-500">
                {[dispatch.Group ? `${t('call_detail.group')}: ${dispatch.Group}` : null, dispatch.Type ? `${t('call_detail.type')}: ${dispatch.Type}` : null].filter(Boolean).join('  ')}
              </Text>
              {showEtas && isUnit && dispatch.Id ? <UnitNavigationEtaChip unitId={dispatch.Id} callId={callId} testID={`call-dispatched-${dispatch.Id}-eta`} /> : null}
            </View>
            {dispatch.ResponseCode ? (
              <View style={StyleSheet.flatten([styles.code, { backgroundColor: dispatch.ResponseCodeColor || '#374151' }])} accessible accessibilityLabel={dispatch.ResponseCodeName || dispatch.ResponseCode}>
                <Text style={styles.codeText}>{dispatch.ResponseCode}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  buttonIcon: { marginRight: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 10, marginBottom: 8 },
  badge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  icon: { marginRight: 8 },
  body: { flex: 1 },
  code: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  codeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
