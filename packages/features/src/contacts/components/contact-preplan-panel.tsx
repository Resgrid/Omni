import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useContactsStore } from '@resgrid/data';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type ContactHazardData, type ContactPreplanData } from '@resgrid/models';
import { HStack, Spinner, Text, VStack } from '@resgrid/ui';
import { AlertTriangle } from 'lucide-react-native';
import React, { useEffect } from 'react';

const SEVERITY_CLASSES: Record<number, string> = { 0: 'border-info-300 bg-info-50', 1: 'border-warning-300 bg-warning-50', 2: 'border-error-300 bg-error-50' };

// Withheld plan text arrives as the sentinel (ADP catalog v12); it renders as the protected label, never raw.
const Field: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) =>
  value === null || value === undefined || value === '' ? null : (
    <HStack space="md" className="items-start justify-between py-1">
      <Text className="text-sm text-typography-500">{label}</Text>
      {value === 'REDACTED' ? <ProtectedLabel size="sm" /> : <Text className="flex-1 text-right text-sm text-typography-900">{String(value)}</Text>}
    </HStack>
  );

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <VStack className="rounded-lg border border-outline-200 bg-background-0 p-3">
    <Text className="mb-1 font-semibold text-typography-900">{title}</Text>
    {children}
  </VStack>
);

const Hazard: React.FC<{ hazard: ContactHazardData }> = ({ hazard }) => (
  <VStack className={`rounded-lg border p-3 ${SEVERITY_CLASSES[hazard.Severity] ?? SEVERITY_CLASSES[0]}`} testID={`contact-hazard-${hazard.ContactPreplanHazardId}`}>
    <HStack space="sm" className="items-center">
      <AlertTriangle size={14} color="#b45309" />
      {hazard.Title === 'REDACTED' ? <ProtectedLabel size="sm" /> : <Text className="flex-1 font-semibold text-typography-900">{hazard.Title}</Text>}
      <Text className="text-xs text-typography-600">{hazard.SeverityName}</Text>
    </HStack>
    {hazard.Description ? hazard.Description === 'REDACTED' ? <ProtectedLabel size="sm" /> : <Text className="text-sm text-typography-800">{hazard.Description}</Text> : null}
    {hazard.LocationDescription && hazard.LocationDescription !== 'REDACTED' ? <Text className="text-xs text-typography-600">{hazard.LocationDescription}</Text> : null}
  </VStack>
);

/** The pre-incident plan summary (Dispatch preplan panel, NFPA 1620): tactical summary, hazards, access, utilities, water. */
export const ContactPreplanPanel: React.FC<{ contactId: string }> = ({ contactId }) => {
  const { t } = useTranslation();
  const preplan: ContactPreplanData | null | undefined = useContactsStore((state) => state.preplansByContact[contactId]);
  const isLoading = useContactsStore((state) => state.loading.preplan === true);

  useEffect(() => {
    void useContactsStore.getState().fetchPreplan(contactId);
  }, [contactId]);

  if (preplan === undefined && isLoading) return <Spinner testID="contact-preplan-loading" />;
  if (!preplan) return <Text className="py-4 text-center text-typography-500">{t('contacts.preplan.none')}</Text>;

  return (
    <VStack space="md" testID="contact-preplan-panel">
      {preplan.IsReviewOverdue ? (
        <Text className="rounded-lg bg-warning-50 p-2 text-sm text-warning-700" testID="contact-preplan-overdue">
          {t('contacts.preplan.review_overdue')}
        </Text>
      ) : null}
      {preplan.TacticalSummary ? (
        <Section title={t('contacts.preplan.tactical_summary')}>
          {preplan.TacticalSummary === 'REDACTED' ? <ProtectedLabel size="sm" /> : <Text className="text-sm text-typography-900">{preplan.TacticalSummary}</Text>}
        </Section>
      ) : null}
      {preplan.Hazards.length > 0 || preplan.HazmatOnSite || preplan.GeneralHazardNotes ? (
        <Section title={t('contacts.preplan.general_hazards')}>
          <VStack space="sm">
            {preplan.HazmatOnSite ? <Text className="text-sm font-semibold text-error-600">{t('contacts.preplan.hazmat_on_site')}</Text> : null}
            {preplan.Hazards.map((hazard) => (
              <Hazard key={hazard.ContactPreplanHazardId} hazard={hazard} />
            ))}
            <Field label={t('contacts.preplan.general_hazard_notes')} value={preplan.GeneralHazardNotes} />
          </VStack>
        </Section>
      ) : null}
      <Section title={t('contacts.preplan.occupancy')}>
        <Field label={t('contacts.preplan.construction')} value={[preplan.ConstructionTypeName, preplan.RoofTypeName, preplan.OccupancyTypeName].filter((part) => !!part).join(' · ')} />
        <Field label={t('contacts.preplan.occupancy_hours')} value={preplan.OccupancyHours} />
        <Field label={t('contacts.preplan.occupant_load')} value={preplan.OccupantLoad} />
        {preplan.HasOccupantsNeedingAssistance ? <Text className="text-sm text-warning-700">{t('contacts.preplan.occupants_needing_assistance')}</Text> : null}
      </Section>
      <Section title={t('contacts.preplan.access')}>
        <Field label={t('contacts.preplan.knox_box')} value={preplan.KnoxBoxLocation} />
        <Field label={t('contacts.preplan.gate_code')} value={preplan.GateCode} />
        <Field label={t('contacts.preplan.alarm_panel')} value={preplan.AlarmPanelLocation} />
        <Field label={t('contacts.preplan.alarm_company')} value={preplan.AlarmCompany} />
        <Field label={t('contacts.preplan.alarm_company_phone')} value={preplan.AlarmCompanyPhone} />
        <Field label={t('contacts.preplan.access_notes')} value={preplan.AccessNotes} />
      </Section>
      <Section title={t('contacts.preplan.utilities')}>
        <Field label={t('contacts.preplan.gas_shutoff')} value={preplan.GasShutoffLocation} />
        <Field label={t('contacts.preplan.electric_shutoff')} value={preplan.ElectricShutoffLocation} />
        <Field label={t('contacts.preplan.water_shutoff')} value={preplan.WaterShutoffLocation} />
        <Field label={t('contacts.preplan.utility_notes')} value={preplan.UtilityNotes} />
      </Section>
      <Section title={t('contacts.preplan.water_supply')}>
        <Field label={t('contacts.preplan.nearest_hydrant')} value={preplan.NearestHydrantLocation} />
        <Field label={t('contacts.preplan.required_fire_flow')} value={preplan.RequiredFireFlowGpm} />
        <Field label={t('contacts.preplan.water_supply_notes')} value={preplan.WaterSupplyNotes} />
      </Section>
      <Section title={t('contacts.preplan.on_site_contacts')}>
        <Field label={t('contacts.preplan.emergency_contact')} value={preplan.EmergencyContactName} />
        <Field label={t('contacts.preplan.emergency_contact_phone')} value={preplan.EmergencyContactPhone} />
        <Field label={t('contacts.preplan.secondary_contact')} value={preplan.SecondaryContactName} />
        <Field label={t('contacts.preplan.secondary_contact_phone')} value={preplan.SecondaryContactPhone} />
      </Section>
      <Text className="text-xs text-typography-400">{`${t('contacts.preplan.last_reviewed')}: ${preplan.LastReviewedOnUtc ? safeFormatDate(preplan.LastReviewedOnUtc, 'MMM d, yyyy') : t('contacts.preplan.never_reviewed')}`}</Text>
    </VStack>
  );
};
