import { useCallsStore, useMessagesStore, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Text } from '@resgrid/ui';
import React, { useEffect, useMemo } from 'react';

import { useWidgetSettingsStore } from '../../hooks/use-widget-settings-store';
import { CALLS_COLUMN_LABEL_KEYS, PERSONNEL_COLUMN_LABEL_KEYS, SCHEDULED_CALLS_COLUMN_LABEL_KEYS, UNITS_COLUMN_LABEL_KEYS } from '../../lib/column-labels';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type WidgetSettings, type WidgetSettingsSection } from '../../lib/widget-settings';
import type { WidgetType } from '../../lib/widget-types';
import { ColumnOrderEditor, CoordinateInput, EntityMultiSelect, type MultiSelectOption, NumberStepper, SegmentedChoice, SettingsSection, SettingSwitch, TextSetting } from './setting-controls';

/** The settings section behind each widget type (unit alerts has none: its timers are department settings in Core). */
export const WIDGET_SETTINGS_SECTION: Readonly<Record<WidgetType, WidgetSettingsSection | null>> = {
  personnel: 'personnel',
  units: 'units',
  calls: 'calls',
  map: 'map',
  weather: 'weather',
  notes: 'notes',
  time: 'time',
  personnel_status_summary: 'personnelStatusSummary',
  personnel_staffing_summary: 'personnelStaffingSummary',
  units_summary: 'unitsSummary',
  calls_summary: 'callsSummary',
  weather_alerts: 'weatherAlerts',
  scheduled_calls: 'scheduledCalls',
  unit_alerts: null,
};

/** Settings of one section plus a typed updater. */
function useSection<S extends WidgetSettingsSection>(section: S): [WidgetSettings[S], (patch: Partial<WidgetSettings[S]>) => void] {
  const settings = useWidgetSettingsStore((state) => state[section]);
  const updateSettings = useWidgetSettingsStore((state) => state.updateSettings);
  return [settings, (patch) => updateSettings(section, patch)];
}

const FontSize: React.FC<{ value: number; onChange: (value: number) => void; testID: string }> = ({ value, onChange, testID }) => {
  const { t } = useTranslation();
  return <NumberStepper label={t('dashboard.font_size')} value={value} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} onChange={onChange} testID={testID} format={(size) => `${size}pt`} />;
};

/** Groups as picker options (`Groups/GetAllGroups`, loaded on demand). */
const useGroupOptions = (): MultiSelectOption[] => {
  const groups = usePersonnelStore((state) => state.groups);
  useEffect(() => {
    if (groups.length === 0) void usePersonnelStore.getState().fetchGroups();
  }, [groups.length]);
  return useMemo(() => groups.map((group) => ({ id: String(group.GroupId), label: group.Name })), [groups]);
};

const PersonnelPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('personnel');
  const groups = useGroupOptions();
  return (
    <>
      <SettingsSection title={t('configure.visible_columns')}>
        <SettingSwitch label={t('personnel.column.group')} value={settings.showGroup} onChange={(showGroup) => update({ showGroup })} testID="setting-personnel-showGroup" />
        <SettingSwitch label={t('personnel.column.staffing')} value={settings.showStaffing} onChange={(showStaffing) => update({ showStaffing })} testID="setting-personnel-showStaffing" />
        <SettingSwitch label={t('personnel.column.status')} value={settings.showStatus} onChange={(showStatus) => update({ showStatus })} testID="setting-personnel-showStatus" />
        <SettingSwitch label={t('personnel.column.roles')} value={settings.showRoles} onChange={(showRoles) => update({ showRoles })} testID="setting-personnel-showRoles" />
        <SettingSwitch label={t('personnel.column.timestamp')} value={settings.showTimestamp} onChange={(showTimestamp) => update({ showTimestamp })} testID="setting-personnel-showTimestamp" />
      </SettingsSection>
      <SettingsSection title={t('configure.column_order')} description={t('configure.use_arrows_reorder')}>
        <ColumnOrderEditor order={settings.columnOrder} labelOf={(key) => t(PERSONNEL_COLUMN_LABEL_KEYS[key])} onChange={(columnOrder) => update({ columnOrder })} testID="setting-personnel-columns" />
      </SettingsSection>
      <SettingsSection title={t('configure.options')}>
        <SettingSwitch
          label={t('configure.sort_responding_to_top')}
          value={settings.sortRespondingToTop}
          onChange={(sortRespondingToTop) => update({ sortRespondingToTop })}
          testID="setting-personnel-sortRespondingToTop"
        />
        <SettingSwitch label={t('configure.hide_not_responding')} value={settings.hideNotResponding} onChange={(hideNotResponding) => update({ hideNotResponding })} testID="setting-personnel-hideNotResponding" />
        <SettingSwitch label={t('configure.hide_unavailable')} value={settings.hideUnavailable} onChange={(hideUnavailable) => update({ hideUnavailable })} testID="setting-personnel-hideUnavailable" />
        <Text className="text-xs text-typography-500">{t('dashboard.meaning_hint')}</Text>
        <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-personnel-fontSize" />
      </SettingsSection>
      <SettingsSection title={t('dashboard.hide_groups')}>
        <EntityMultiSelect label={t('configure.filter_groups')} options={groups} selectedIds={settings.hideGroups} onChange={(hideGroups) => update({ hideGroups })} testID="setting-personnel-hideGroups" />
      </SettingsSection>
    </>
  );
};

const UnitsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('units');
  const groups = useGroupOptions();
  return (
    <>
      <SettingsSection title={t('configure.visible_columns')}>
        <SettingSwitch label={t('dashboard.column.station')} value={settings.showStation} onChange={(showStation) => update({ showStation })} testID="setting-units-showStation" />
        <SettingSwitch label={t('dashboard.column.type')} value={settings.showType} onChange={(showType) => update({ showType })} testID="setting-units-showType" />
        <SettingSwitch label={t('dashboard.column.state')} value={settings.showState} onChange={(showState) => update({ showState })} testID="setting-units-showState" />
        <SettingSwitch label={t('dashboard.column.updated')} value={settings.showTimestamp} onChange={(showTimestamp) => update({ showTimestamp })} testID="setting-units-showTimestamp" />
      </SettingsSection>
      <SettingsSection title={t('configure.column_order')} description={t('configure.use_arrows_reorder')}>
        <ColumnOrderEditor order={settings.columnOrder} labelOf={(key) => t(UNITS_COLUMN_LABEL_KEYS[key])} onChange={(columnOrder) => update({ columnOrder })} testID="setting-units-columns" />
      </SettingsSection>
      <SettingsSection title={t('configure.options')}>
        <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-units-fontSize" />
      </SettingsSection>
      <SettingsSection title={t('dashboard.hide_groups')}>
        <EntityMultiSelect label={t('configure.filter_groups')} options={groups} selectedIds={settings.hideGroups} onChange={(hideGroups) => update({ hideGroups })} testID="setting-units-hideGroups" />
      </SettingsSection>
    </>
  );
};

const CallsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('calls');
  return (
    <>
      <SettingsSection title={t('configure.display_options')}>
        <SegmentedChoice
          label={t('dashboard.calls_display')}
          options={[
            { value: 'cards', label: t('dashboard.calls_display_cards') },
            { value: 'table', label: t('dashboard.calls_display_table') },
          ]}
          value={settings.display}
          onChange={(display) => update({ display })}
          testID="setting-calls-display"
        />
        <SettingSwitch label={t('configure.dispatched')} value={settings.showDispatched} onChange={(showDispatched) => update({ showDispatched })} testID="setting-calls-showDispatched" />
        <SettingSwitch label={t('dashboard.scroll_dispatches')} value={settings.scrollDispatches} onChange={(scrollDispatches) => update({ scrollDispatches })} testID="setting-calls-scrollDispatches" />
      </SettingsSection>
      {settings.display === 'table' ? (
        <>
          <SettingsSection title={t('configure.visible_columns')}>
            <SettingSwitch label={t('configure.id')} value={settings.showId} onChange={(showId) => update({ showId })} testID="setting-calls-showId" />
            <SettingSwitch label={t('configure.name')} value={settings.showName} onChange={(showName) => update({ showName })} testID="setting-calls-showName" />
            <SettingSwitch label={t('configure.address')} value={settings.showAddress} onChange={(showAddress) => update({ showAddress })} testID="setting-calls-showAddress" />
            <SettingSwitch label={t('configure.timestamp')} value={settings.showTimestamp} onChange={(showTimestamp) => update({ showTimestamp })} testID="setting-calls-showTimestamp" />
            <SettingSwitch label={t('configure.priority')} value={settings.showPriority} onChange={(showPriority) => update({ showPriority })} testID="setting-calls-showPriority" />
          </SettingsSection>
          <SettingsSection title={t('configure.column_order')} description={t('configure.use_arrows_reorder')}>
            <ColumnOrderEditor order={settings.columnOrder} labelOf={(key) => t(CALLS_COLUMN_LABEL_KEYS[key])} onChange={(columnOrder) => update({ columnOrder })} testID="setting-calls-columns" />
          </SettingsSection>
          <SettingsSection title={t('configure.options')}>
            <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-calls-fontSize" />
          </SettingsSection>
        </>
      ) : null}
    </>
  );
};

const MapPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('map');
  return (
    <>
      <SettingsSection title={t('configure.map_options')}>
        <SettingSwitch label={t('configure.zoom_out_show_all')} value={settings.showAllMarkers} onChange={(showAllMarkers) => update({ showAllMarkers })} testID="setting-map-showAllMarkers" />
        <NumberStepper label={t('dashboard.zoom_level')} value={settings.zoomLevel} min={1} max={20} onChange={(zoomLevel) => update({ zoomLevel })} testID="setting-map-zoomLevel" />
        <SettingSwitch label={t('configure.hide_labels')} value={settings.hideLabels} onChange={(hideLabels) => update({ hideLabels })} testID="setting-map-hideLabels" />
      </SettingsSection>
      <SettingsSection title={t('configure.visible_pins')}>
        <SettingSwitch label={t('configure.show_calls')} value={settings.showCalls} onChange={(showCalls) => update({ showCalls })} testID="setting-map-showCalls" />
        <SettingSwitch label={t('configure.show_units')} value={settings.showUnits} onChange={(showUnits) => update({ showUnits })} testID="setting-map-showUnits" />
        <SettingSwitch label={t('configure.show_stations')} value={settings.showStations} onChange={(showStations) => update({ showStations })} testID="setting-map-showStations" />
        <SettingSwitch label={t('configure.show_personnel')} value={settings.showPersonnel} onChange={(showPersonnel) => update({ showPersonnel })} testID="setting-map-showPersonnel" />
      </SettingsSection>
      <SettingsSection title={t('configure.map_center')} description={t('dashboard.center_hint')}>
        <CoordinateInput label={t('configure.latitude')} value={settings.latitude} limit={90} onChange={(latitude) => update({ latitude })} testID="setting-map-latitude" />
        <CoordinateInput label={t('configure.longitude')} value={settings.longitude} limit={180} onChange={(longitude) => update({ longitude })} testID="setting-map-longitude" />
      </SettingsSection>
    </>
  );
};

const WeatherPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('weather');
  return (
    <SettingsSection title={t('configure.options')} description={t('dashboard.center_hint')}>
      <SegmentedChoice
        label={t('dashboard.weather.units')}
        options={[
          { value: 'imperial', label: t('dashboard.weather.units_imperial') },
          { value: 'metric', label: t('dashboard.weather.units_metric') },
          { value: 'standard', label: t('dashboard.weather.units_standard') },
        ]}
        value={settings.units}
        onChange={(units) => update({ units })}
        testID="setting-weather-units"
      />
      <CoordinateInput label={t('configure.latitude')} value={settings.latitude} limit={90} onChange={(latitude) => update({ latitude })} testID="setting-weather-latitude" />
      <CoordinateInput label={t('configure.longitude')} value={settings.longitude} limit={180} onChange={(longitude) => update({ longitude })} testID="setting-weather-longitude" />
    </SettingsSection>
  );
};

const NotesPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('notes');
  return (
    <SettingsSection title={t('configure.options')}>
      <TextSetting
        label={t('dashboard.notes_category')}
        value={settings.category}
        placeholder={t('dashboard.notes_category_all')}
        onChange={(category) => update({ category: category.trim() })}
        testID="setting-notes-category"
      />
      <SettingSwitch
        label={t('dashboard.notes_include_uncategorized')}
        value={settings.includeUncategorized}
        onChange={(includeUncategorized) => update({ includeUncategorized })}
        testID="setting-notes-includeUncategorized"
      />
    </SettingsSection>
  );
};

const TimePanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('time');
  return (
    <SettingsSection title={t('configure.options')}>
      <SettingSwitch label={t('dashboard.time_24_hour')} value={settings.format24Hour} onChange={(format24Hour) => update({ format24Hour })} testID="setting-time-format24Hour" />
      <SettingSwitch label={t('dashboard.time_show_seconds')} value={settings.showSeconds} onChange={(showSeconds) => update({ showSeconds })} testID="setting-time-showSeconds" />
    </SettingsSection>
  );
};

const StatusSummaryPanel: React.FC<{ section: 'personnelStatusSummary' | 'personnelStaffingSummary' }> = ({ section }) => {
  const { t } = useTranslation();
  const [settings, update] = useSection(section);
  return (
    <SettingsSection title={t('configure.options')}>
      <SettingSwitch label={t('dashboard.show_colors')} value={settings.showColors} onChange={(showColors) => update({ showColors })} testID={`setting-${section}-showColors`} />
      <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID={`setting-${section}-fontSize`} />
    </SettingsSection>
  );
};

const UnitsSummaryPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('unitsSummary');
  return (
    <SettingsSection title={t('configure.options')}>
      <SettingSwitch label={t('dashboard.summary.available')} value={settings.showAvailable} onChange={(showAvailable) => update({ showAvailable })} testID="setting-unitsSummary-showAvailable" />
      <SettingSwitch label={t('dashboard.summary.responding')} value={settings.showResponding} onChange={(showResponding) => update({ showResponding })} testID="setting-unitsSummary-showResponding" />
      <SettingSwitch label={t('dashboard.summary.on_scene')} value={settings.showOnScene} onChange={(showOnScene) => update({ showOnScene })} testID="setting-unitsSummary-showOnScene" />
      <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-unitsSummary-fontSize" />
    </SettingsSection>
  );
};

const CallsSummaryPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('callsSummary');
  const priorities = useCallsStore((state) => state.callPriorities);
  useEffect(() => {
    if (priorities.length === 0) void useCallsStore.getState().fetchCallPriorities();
  }, [priorities.length]);
  const options = useMemo(() => priorities.filter((priority) => !priority.IsDeleted).map((priority) => ({ id: String(priority.Id), label: priority.Name })), [priorities]);
  return (
    <SettingsSection title={t('configure.options')}>
      <SettingSwitch label={t('dashboard.summary.show_recent')} value={settings.showRecentCall} onChange={(showRecentCall) => update({ showRecentCall })} testID="setting-callsSummary-showRecentCall" />
      <SettingSwitch
        label={t('dashboard.summary.show_priorities')}
        value={settings.showPriorityCounts}
        onChange={(showPriorityCounts) => update({ showPriorityCounts })}
        testID="setting-callsSummary-showPriorityCounts"
      />
      <NumberStepper
        label={t('dashboard.summary.max_priorities')}
        value={settings.maxPrioritiesToShow}
        min={0}
        max={20}
        onChange={(maxPrioritiesToShow) => update({ maxPrioritiesToShow })}
        format={(value) => (value === 0 ? t('dashboard.summary.all') : String(value))}
        testID="setting-callsSummary-maxPrioritiesToShow"
      />
      <EntityMultiSelect
        label={t('dashboard.summary.priorities')}
        options={options}
        selectedIds={settings.priorityIds.map(String)}
        onChange={(ids) => update({ priorityIds: ids.map(Number).filter((id) => Number.isFinite(id)) })}
        testID="setting-callsSummary-priorityIds"
      />
      <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-callsSummary-fontSize" />
    </SettingsSection>
  );
};

const WeatherAlertsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('weatherAlerts');
  return (
    <>
      <SettingsSection title={t('configure.severity_levels')}>
        <SettingSwitch label={t('weather_alerts.severity.extreme')} value={settings.showExtreme} onChange={(showExtreme) => update({ showExtreme })} testID="setting-weatherAlerts-showExtreme" />
        <SettingSwitch label={t('weather_alerts.severity.severe')} value={settings.showSevere} onChange={(showSevere) => update({ showSevere })} testID="setting-weatherAlerts-showSevere" />
        <SettingSwitch label={t('weather_alerts.severity.moderate')} value={settings.showModerate} onChange={(showModerate) => update({ showModerate })} testID="setting-weatherAlerts-showModerate" />
        <SettingSwitch label={t('weather_alerts.severity.minor')} value={settings.showMinor} onChange={(showMinor) => update({ showMinor })} testID="setting-weatherAlerts-showMinor" />
        <SettingSwitch label={t('weather_alerts.severity.unknown')} value={settings.showUnknown} onChange={(showUnknown) => update({ showUnknown })} testID="setting-weatherAlerts-showUnknown" />
      </SettingsSection>
      <SettingsSection title={t('configure.alert_categories')}>
        <SettingSwitch label={t('weather_alerts.category.met')} value={settings.showCategoryMet} onChange={(showCategoryMet) => update({ showCategoryMet })} testID="setting-weatherAlerts-showCategoryMet" />
        <SettingSwitch label={t('weather_alerts.category.fire')} value={settings.showCategoryFire} onChange={(showCategoryFire) => update({ showCategoryFire })} testID="setting-weatherAlerts-showCategoryFire" />
        <SettingSwitch
          label={t('weather_alerts.category.health')}
          value={settings.showCategoryHealth}
          onChange={(showCategoryHealth) => update({ showCategoryHealth })}
          testID="setting-weatherAlerts-showCategoryHealth"
        />
        <SettingSwitch label={t('weather_alerts.category.env')} value={settings.showCategoryEnv} onChange={(showCategoryEnv) => update({ showCategoryEnv })} testID="setting-weatherAlerts-showCategoryEnv" />
        <SettingSwitch label={t('weather_alerts.category.other')} value={settings.showCategoryOther} onChange={(showCategoryOther) => update({ showCategoryOther })} testID="setting-weatherAlerts-showCategoryOther" />
      </SettingsSection>
      <SettingsSection title={t('configure.display_options')}>
        <SettingSwitch label={t('configure.show_headline')} value={settings.showHeadline} onChange={(showHeadline) => update({ showHeadline })} testID="setting-weatherAlerts-showHeadline" />
        <SettingSwitch label={t('configure.show_area')} value={settings.showArea} onChange={(showArea) => update({ showArea })} testID="setting-weatherAlerts-showArea" />
        <SettingSwitch label={t('configure.show_expiry')} value={settings.showExpiry} onChange={(showExpiry) => update({ showExpiry })} testID="setting-weatherAlerts-showExpiry" />
        <NumberStepper
          label={t('dashboard.max_alerts')}
          value={settings.maxAlertsInWidget}
          min={1}
          max={20}
          onChange={(maxAlertsInWidget) => update({ maxAlertsInWidget })}
          testID="setting-weatherAlerts-maxAlertsInWidget"
        />
        <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-weatherAlerts-fontSize" />
      </SettingsSection>
    </>
  );
};

const ScheduledCallsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, update] = useSection('scheduledCalls');
  const groups = useGroupOptions();
  const unitInfos = useUnitsStore((state) => state.unitInfos);
  const personnel = usePersonnelStore((state) => state.personnel);
  const recipients = useMessagesStore((state) => state.recipients);
  useEffect(() => {
    if (unitInfos.length === 0) void useUnitsStore.getState().fetchUnitInfos();
    if (personnel.length === 0) void usePersonnelStore.getState().fetchPersonnel();
    if (recipients.length === 0) void useMessagesStore.getState().fetchRecipients();
  }, [personnel.length, recipients.length, unitInfos.length]);
  const unitOptions = useMemo(() => unitInfos.map((unit) => ({ id: String(unit.UnitId), label: unit.Name })), [unitInfos]);
  const personnelOptions = useMemo(() => personnel.map((person) => ({ id: String(person.UserId), label: `${person.FirstName ?? ''} ${person.LastName ?? ''}`.trim() })), [personnel]);
  const roleOptions = useMemo(() => recipients.filter((recipient) => (recipient.Type ?? '').toLowerCase().startsWith('role')).map((recipient) => ({ id: String(recipient.Id), label: recipient.Name })), [recipients]);
  const minutes = (value: number): string => t('dashboard.minutes_value', { count: value });

  return (
    <>
      <SettingsSection title={t('configure.visible_columns')}>
        <SettingSwitch label={t('configure.name')} value={settings.showName} onChange={(showName) => update({ showName })} testID="setting-scheduledCalls-showName" />
        <SettingSwitch label={t('configure.scheduled_time')} value={settings.showScheduledTime} onChange={(showScheduledTime) => update({ showScheduledTime })} testID="setting-scheduledCalls-showScheduledTime" />
        <SettingSwitch label={t('configure.priority')} value={settings.showPriority} onChange={(showPriority) => update({ showPriority })} testID="setting-scheduledCalls-showPriority" />
        <SettingSwitch label={t('configure.address')} value={settings.showAddress} onChange={(showAddress) => update({ showAddress })} testID="setting-scheduledCalls-showAddress" />
        <SettingSwitch label={t('configure.dispatched')} value={settings.showDispatched} onChange={(showDispatched) => update({ showDispatched })} testID="setting-scheduledCalls-showDispatched" />
      </SettingsSection>
      <SettingsSection title={t('configure.column_order')} description={t('configure.use_arrows_reorder')}>
        <ColumnOrderEditor order={settings.columnOrder} labelOf={(key) => t(SCHEDULED_CALLS_COLUMN_LABEL_KEYS[key])} onChange={(columnOrder) => update({ columnOrder })} testID="setting-scheduledCalls-columns" />
      </SettingsSection>
      <SettingsSection title={t('configure.sorting')}>
        <SegmentedChoice
          label={t('configure.sort_by')}
          options={[
            { value: 'scheduledTime', label: t('configure.scheduled_time') },
            { value: 'priority', label: t('configure.priority') },
            { value: 'name', label: t('configure.name') },
          ]}
          value={settings.sortBy}
          onChange={(sortBy) => update({ sortBy })}
          testID="setting-scheduledCalls-sortBy"
        />
        <SegmentedChoice
          label={t('configure.sort_order')}
          options={[
            { value: 'asc', label: t('configure.ascending') },
            { value: 'desc', label: t('configure.descending') },
          ]}
          value={settings.sortOrder}
          onChange={(sortOrder) => update({ sortOrder })}
          testID="setting-scheduledCalls-sortOrder"
        />
      </SettingsSection>
      <SettingsSection title={t('configure.filtering')} description={t('configure.filter_help_select')}>
        <EntityMultiSelect
          label={t('configure.filter_groups')}
          options={groups}
          selectedIds={settings.filterGroupIds}
          onChange={(filterGroupIds) => update({ filterGroupIds })}
          testID="setting-scheduledCalls-filterGroupIds"
        />
        <EntityMultiSelect
          label={t('configure.filter_units')}
          options={unitOptions}
          selectedIds={settings.filterUnitIds}
          onChange={(filterUnitIds) => update({ filterUnitIds })}
          testID="setting-scheduledCalls-filterUnitIds"
        />
        <EntityMultiSelect
          label={t('configure.filter_personnel')}
          options={personnelOptions}
          selectedIds={settings.filterPersonnelIds}
          onChange={(filterPersonnelIds) => update({ filterPersonnelIds })}
          testID="setting-scheduledCalls-filterPersonnelIds"
        />
        <EntityMultiSelect
          label={t('configure.filter_roles')}
          options={roleOptions}
          selectedIds={settings.filterRoleIds}
          onChange={(filterRoleIds) => update({ filterRoleIds })}
          testID="setting-scheduledCalls-filterRoleIds"
        />
      </SettingsSection>
      <SettingsSection title={t('configure.urgency_color_coding')} description={t('configure.color_coding_help')}>
        <NumberStepper
          label={t('dashboard.red_within')}
          value={settings.colorThresholdRedMinutes}
          min={1}
          max={1440}
          step={5}
          onChange={(red) =>
            update({ colorThresholdRedMinutes: red, colorThresholdYellowMinutes: Math.max(settings.colorThresholdYellowMinutes, red), colorThresholdGreenMinutes: Math.max(settings.colorThresholdGreenMinutes, red) })
          }
          format={minutes}
          testID="setting-scheduledCalls-red"
        />
        <NumberStepper
          label={t('dashboard.yellow_within')}
          value={settings.colorThresholdYellowMinutes}
          min={settings.colorThresholdRedMinutes}
          max={2880}
          step={15}
          onChange={(yellow) => update({ colorThresholdYellowMinutes: yellow, colorThresholdGreenMinutes: Math.max(settings.colorThresholdGreenMinutes, yellow) })}
          format={minutes}
          testID="setting-scheduledCalls-yellow"
        />
        <NumberStepper
          label={t('dashboard.green_within')}
          value={settings.colorThresholdGreenMinutes}
          min={settings.colorThresholdYellowMinutes}
          max={10080}
          step={30}
          onChange={(colorThresholdGreenMinutes) => update({ colorThresholdGreenMinutes })}
          format={minutes}
          testID="setting-scheduledCalls-green"
        />
      </SettingsSection>
      <SettingsSection title={t('configure.options')}>
        <SettingSwitch label={t('dashboard.scroll_dispatches')} value={settings.scrollDispatches} onChange={(scrollDispatches) => update({ scrollDispatches })} testID="setting-scheduledCalls-scrollDispatches" />
        <FontSize value={settings.fontSize} onChange={(fontSize) => update({ fontSize })} testID="setting-scheduledCalls-fontSize" />
      </SettingsSection>
    </>
  );
};

/** One widget type's settings form. */
export const WidgetSettingsPanel: React.FC<{ type: WidgetType }> = ({ type }) => {
  const { t } = useTranslation();
  switch (type) {
    case 'personnel':
      return <PersonnelPanel />;
    case 'units':
      return <UnitsPanel />;
    case 'calls':
      return <CallsPanel />;
    case 'map':
      return <MapPanel />;
    case 'weather':
      return <WeatherPanel />;
    case 'notes':
      return <NotesPanel />;
    case 'time':
      return <TimePanel />;
    case 'personnel_status_summary':
      return <StatusSummaryPanel section="personnelStatusSummary" />;
    case 'personnel_staffing_summary':
      return <StatusSummaryPanel section="personnelStaffingSummary" />;
    case 'units_summary':
      return <UnitsSummaryPanel />;
    case 'calls_summary':
      return <CallsSummaryPanel />;
    case 'weather_alerts':
      return <WeatherAlertsPanel />;
    case 'scheduled_calls':
      return <ScheduledCallsPanel />;
    case 'unit_alerts':
      return (
        <SettingsSection title={t('configure.options')} testID="configure-unit-alerts-hint">
          <Text className="text-sm text-typography-600">{t('dashboard.unit_alerts_hint')}</Text>
        </SettingsSection>
      );
    default:
      return null;
  }
};
