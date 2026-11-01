import React from 'react';

import type { WidgetType } from '../lib/widget-types';
import { CallsSummaryWidget } from './widgets/calls-summary-widget';
import { CallsWidget } from './widgets/calls-widget';
import { MapWidget } from './widgets/map-widget';
import { NotesWidget } from './widgets/notes-widget';
import { PersonnelStaffingSummaryWidget, PersonnelStatusSummaryWidget } from './widgets/personnel-option-summary-widget';
import { PersonnelWidget } from './widgets/personnel-widget';
import { ScheduledCallsWidget } from './widgets/scheduled-calls-widget';
import { TimeWidget } from './widgets/time-widget';
import type { WidgetProps } from './widgets/types';
import { UnitAlertsWidget } from './widgets/unit-alerts-widget';
import { UnitsSummaryWidget } from './widgets/units-summary-widget';
import { UnitsWidget } from './widgets/units-widget';
import { WeatherAlertsWidget } from './widgets/weather-alerts-widget';
import { WeatherWidget } from './widgets/weather-widget';

/** The component behind each widget type (all 14). */
export const WIDGET_COMPONENTS: Readonly<Record<WidgetType, React.ComponentType<WidgetProps>>> = {
  personnel: PersonnelWidget,
  units: UnitsWidget,
  calls: CallsWidget,
  map: MapWidget,
  weather: WeatherWidget,
  notes: NotesWidget,
  time: TimeWidget,
  personnel_status_summary: PersonnelStatusSummaryWidget,
  personnel_staffing_summary: PersonnelStaffingSummaryWidget,
  units_summary: UnitsSummaryWidget,
  calls_summary: CallsSummaryWidget,
  weather_alerts: WeatherAlertsWidget,
  scheduled_calls: ScheduledCallsWidget,
  unit_alerts: UnitAlertsWidget,
};

export interface WidgetRendererProps extends WidgetProps {
  type: WidgetType;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ type, ...props }) => {
  const Component = WIDGET_COMPONENTS[type];
  return <Component {...props} />;
};
