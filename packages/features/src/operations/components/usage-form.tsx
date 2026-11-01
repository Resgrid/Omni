import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type AddResourceUsageInput, type DeploymentUnit, type ResourceUsage, UsagePhase } from '@resgrid/models';
import { Button, ButtonText, Input, InputField, Text } from '@resgrid/ui';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface UsageFormProps {
  dateKey: string;
  units: DeploymentUnit[];
  defaultUnitId: string | null;
  readings: ResourceUsage[];
  busy: boolean;
  onAdd: (input: Omit<AddResourceUsageInput, 'DeploymentId' | 'CallId'>) => Promise<boolean>;
}

const numberOrNull = (text: string): number | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
};

/**
 * A resource usage reading (FieldCosting): odometer / meter / fuel for one unit on one day and phase. Conflicting
 * readings are flagged NeedsReview server-side; nothing here prices anything.
 */
export const UsageForm: React.FC<UsageFormProps> = ({ dateKey, units, defaultUnitId, readings, busy, onAdd }) => {
  const { t } = useTranslation();
  // The device's active unit is only a default when it is one of the units offered (Responder fix): otherwise a reading
  // would post against a unit not on the deployment.
  const [unitId, setUnitId] = useState(() => (defaultUnitId && units.some((unit) => String(unit.UnitId) === defaultUnitId) ? defaultUnitId : units[0] ? String(units[0].UnitId) : ''));
  const [phase, setPhase] = useState(String(UsagePhase.Incident));
  const [startOdometer, setStartOdometer] = useState('');
  const [endOdometer, setEndOdometer] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'mi' | 'km'>('mi');
  const [engineHours, setEngineHours] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelUnit, setFuelUnit] = useState<'gal' | 'L'>('gal');
  const [saved, setSaved] = useState(false);
  const unitOptions = units.map((unit) => ({ value: String(unit.UnitId), label: unit.CallSign ? `${unit.UnitName} (${unit.CallSign})` : unit.UnitName }));
  const phaseOptions = [UsagePhase.Mobilization, UsagePhase.Standby, UsagePhase.Incident, UsagePhase.Return].map((value) => ({ value: String(value), label: t(`operations.phase.${value}`) }));
  const start = numberOrNull(startOdometer);
  const end = numberOrNull(endOdometer);
  const complete = !!unitId && (start != null || end != null || numberOrNull(engineHours) != null || numberOrNull(fuelQuantity) != null) && (start == null || end == null || end >= start);

  const submit = async () => {
    setSaved(false);
    const fuel = numberOrNull(fuelQuantity);
    const ok = await onAdd({
      UnitId: Number(unitId),
      UsageDate: `${dateKey}T00:00:00`,
      Phase: Number(phase),
      StartOdometer: start,
      EndOdometer: end,
      DistanceUnit: distanceUnit,
      Distance: start != null && end != null ? end - start : null,
      EngineHours: numberOrNull(engineHours),
      FuelQuantity: fuel,
      FuelUnit: fuel != null ? fuelUnit : null,
    });
    if (ok) {
      setStartOdometer('');
      setEndOdometer('');
      setEngineHours('');
      setFuelQuantity('');
      setSaved(true);
    }
  };

  return (
    <View testID="operations-usage">
      <Text className="mb-1 text-typography-700">{t('operations.usage.unit')}</Text>
      <OptionChips options={unitOptions} selected={unitId ? [unitId] : []} onToggle={setUnitId} accessibilityLabel={t('operations.usage.unit')} testID="operations-usage-unit" />
      <Text className="mb-1 mt-2 text-typography-700">{t('operations.usage.phase')}</Text>
      <OptionChips options={phaseOptions} selected={[phase]} onToggle={setPhase} accessibilityLabel={t('operations.usage.phase')} testID="operations-usage-phase" />
      <View style={styles.row}>
        <Input style={styles.grow}>
          <InputField
            value={startOdometer}
            placeholder={t('operations.usage.startOdometer')}
            keyboardType="decimal-pad"
            onChangeText={setStartOdometer}
            accessibilityLabel={t('operations.usage.startOdometer')}
            testID="operations-usage-start"
          />
        </Input>
        <Input style={styles.grow}>
          <InputField
            value={endOdometer}
            placeholder={t('operations.usage.endOdometer')}
            keyboardType="decimal-pad"
            onChangeText={setEndOdometer}
            accessibilityLabel={t('operations.usage.endOdometer')}
            testID="operations-usage-end"
          />
        </Input>
        <Button variant="outline" size="sm" onPress={() => setDistanceUnit(distanceUnit === 'mi' ? 'km' : 'mi')} accessibilityLabel={distanceUnit} testID="operations-usage-distance-unit">
          <ButtonText>{distanceUnit}</ButtonText>
        </Button>
      </View>
      <View style={styles.row}>
        <Input style={styles.grow}>
          <InputField
            value={engineHours}
            placeholder={t('operations.usage.engineHours')}
            keyboardType="decimal-pad"
            onChangeText={setEngineHours}
            accessibilityLabel={t('operations.usage.engineHours')}
            testID="operations-usage-engine"
          />
        </Input>
        <Input style={styles.grow}>
          <InputField
            value={fuelQuantity}
            placeholder={t('operations.usage.fuel')}
            keyboardType="decimal-pad"
            onChangeText={setFuelQuantity}
            accessibilityLabel={t('operations.usage.fuel')}
            testID="operations-usage-fuel"
          />
        </Input>
        <Button variant="outline" size="sm" onPress={() => setFuelUnit(fuelUnit === 'gal' ? 'L' : 'gal')} accessibilityLabel={fuelUnit} testID="operations-usage-fuel-unit">
          <ButtonText>{fuelUnit}</ButtonText>
        </Button>
      </View>
      <Button className="mt-3" onPress={() => void submit()} isDisabled={busy || !complete} testID="operations-usage-add">
        <ButtonText>{t('operations.usage.add')}</ButtonText>
      </Button>
      {saved ? (
        <Text className="mt-2 text-success-600" testID="operations-usage-saved">
          {t('operations.usage.saved')}
        </Text>
      ) : null}
      {readings.map((reading) => (
        <View key={reading.Id} className="mt-2 rounded-lg border border-outline-200 p-3" testID={`operations-usage-reading-${reading.Id}`}>
          <View style={styles.reading}>
            <View style={styles.flex}>
              <Text className="font-semibold text-typography-900">{`${unitOptions.find((option) => option.value === String(reading.UnitId))?.label ?? reading.UnitId} · ${t(`operations.phase.${reading.Phase}`)}`}</Text>
              <Text size="sm" className="text-typography-500">
                {[
                  String(reading.UsageDate ?? '').slice(0, 10),
                  reading.OriginalDistance != null ? `${reading.OriginalDistance} ${reading.DistanceUnit ?? ''}`.trim() : null,
                  reading.EngineHours != null ? `${reading.EngineHours} h` : null,
                  reading.FuelQuantity != null ? `${reading.FuelQuantity} ${reading.FuelUnit ?? ''}`.trim() : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {reading.NeedsReview ? <Text className="text-warning-600">{t('operations.usage.needsReview')}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  grow: { flex: 1, marginRight: 8 },
  reading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
});
