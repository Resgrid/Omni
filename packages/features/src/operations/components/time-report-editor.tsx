import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type TimeEntry, TimeEntryType, type TimeReport, type TimeReportIssue, TimeReportScope, TimeReportStatus, TimeSubjectType } from '@resgrid/models';
import { Button, ButtonText, DateTimeField, Input, InputField, Switch, Text } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { applyToCrew, combineDateTime, dateOf, endLocalFor, entryHours, type EntrySubject, hoursBySubject, isReportEditable, newEntry, reportNumberText, subjectIdOf, sumHours, timeOf } from '../lib/time';

export interface TimeReportEditorProps {
  dateKey: string;
  report: TimeReport | null;
  entries: TimeEntry[];
  /** Subjects the person may add rows for in this report's scope. */
  subjects: EntrySubject[];
  /** Roster names by subject id, including released members, for stored rows. */
  names: Record<string, string>;
  /** Short name of the crew or person the report covers ("Engine 41"); empty for a deployment DTR. */
  scopeLabel: string;
  isCrew: boolean;
  /** Set when this person's or crew's time for the day already sits on another report. */
  coveredBy: TimeReport | null;
  issues: TimeReportIssue[];
  warnings: TimeReportIssue[];
  canCreate: boolean;
  canApprove: boolean;
  canWrite: (subjectId: string) => boolean;
  dirty: boolean;
  busy: boolean;
  onStart: () => void;
  onChange: (entries: TimeEntry[]) => void;
  onSave: () => void;
  onSubmit: () => void;
  onSign: (crewBossSigned: boolean, customerSignerName?: string | null) => void;
  onApprove: () => void;
}

const typeRank = (entry: TimeEntry): number => (entry.SubjectType === TimeSubjectType.Unit ? 0 : entry.SubjectType === TimeSubjectType.Personnel ? 1 : 2);
const subjectValue = (type: number, id: string): string => `${type}:${id}`;

/**
 * A crew or individual time report for one day (the paper CTR / OF-288 analog; IC baseline). On a crew report the
 * unit's row leads; "Apply to crew" copies its shift to every crew member and piece of equipment on the same entry
 * type. The crew boss signs, the agency signer's name can be recorded, and the report is submitted for approval.
 */
export const TimeReportEditor: React.FC<TimeReportEditorProps> = ({
  dateKey,
  report,
  entries,
  subjects,
  names,
  scopeLabel,
  isCrew,
  coveredBy,
  issues,
  warnings,
  canCreate,
  canApprove,
  canWrite,
  dirty,
  busy,
  onStart,
  onChange,
  onSave,
  onSubmit,
  onSign,
  onApprove,
}) => {
  const { t } = useTranslation();
  const [customerSigner, setCustomerSigner] = useState('');
  const editable = isReportEditable(report);
  const typeOptions = useMemo(() => [TimeEntryType.Deployment, TimeEntryType.Standby, TimeEntryType.Travel].map((value) => ({ value: String(value), label: t(`operations.entryType.${value}`) })), [t]);
  const subjectOptions = useMemo(() => subjects.map((subject) => ({ value: subjectValue(subject.type, subject.id), label: subject.label })), [subjects]);
  // Unit first, then crew, then equipment; indexes still point into the saved order.
  const order = useMemo(() => entries.map((entry, index) => ({ entry, index })).sort((a, b) => typeRank(a.entry) - typeRank(b.entry) || a.index - b.index), [entries]);
  const perSubject = useMemo(() => hoursBySubject(entries), [entries]);

  const update = (index: number, patch: Partial<TimeEntry>) => onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const remove = (index: number) => onChange(entries.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, SortOrder: i })));
  const add = () => {
    const subject = subjects[0];
    if (subject) onChange([...entries, newEntry(subject, dateKey, entries.length)]);
  };
  const setSubject = (index: number, value: string) => {
    const subject = subjects.find((candidate) => subjectValue(candidate.type, candidate.id) === value);
    if (!subject) return;
    const blank = newEntry(subject, dateKey, index);
    update(index, { SubjectType: blank.SubjectType, DeploymentPersonnelId: blank.DeploymentPersonnelId, DeploymentUnitId: blank.DeploymentUnitId, DeploymentEquipmentId: blank.DeploymentEquipmentId });
  };
  const setStart = (index: number, clock: string) => {
    const entry = entries[index];
    const startLocal = combineDateTime(dateOf(entry.StartLocal) || dateKey, clock);
    update(index, { StartLocal: startLocal, EndLocal: endLocalFor(startLocal, timeOf(entry.EndLocal) || clock) });
  };
  const issueFor = (index: number) => issues.filter((issue) => issue.EntryId === String(index) || (!!entries[index]?.Id && issue.EntryId === entries[index]?.Id));
  const issueText = (issue: TimeReportIssue) => t(`operations.issues.${issue.Code}`, { defaultValue: issue.Detail ?? issue.Code });
  const alert = (issue: TimeReportIssue, key: string, tone: 'error' | 'warning') => (
    <Text key={key} size="sm" accessibilityRole={tone === 'error' ? 'alert' : undefined} className={tone === 'error' ? 'text-error-600' : 'text-warning-600'}>
      {issue.SubjectId && names[issue.SubjectId] ? `${issueText(issue)} — ${names[issue.SubjectId]}` : issueText(issue)}
    </Text>
  );

  if (!report) {
    return (
      <View testID="operations-no-report">
        <Text className="text-typography-500">{isCrew ? t('operations.time.noCrewReport', { name: scopeLabel }) : t('operations.time.noReport')}</Text>
        {coveredBy ? <Text className="mt-1 text-typography-500">{t('operations.time.coveredBy', { number: reportNumberText(coveredBy) })}</Text> : null}
        {canCreate && !coveredBy ? (
          <Button className="mt-2" onPress={onStart} isDisabled={busy} testID="operations-start-report">
            <ButtonText>{isCrew ? t('operations.time.startCrew') : t('operations.time.start')}</ButtonText>
          </Button>
        ) : null}
        {/* A refused start comes back as issues with no report to hang them on. */}
        {issues.map((issue, i) => alert(issue, `start-${issue.Code}-${i}`, 'error'))}
      </View>
    );
  }

  const title =
    report.Scope === TimeReportScope.Crew
      ? t('operations.time.crewReport', { number: reportNumberText(report), name: scopeLabel })
      : report.Scope === TimeReportScope.Individual
        ? t('operations.time.individualReport', { number: reportNumberText(report), name: scopeLabel })
        : t('operations.time.report', { number: reportNumberText(report) });
  const signable = report.CanAct && (report.Status === TimeReportStatus.Draft || report.Status === TimeReportStatus.Submitted);
  const looseIssues = issues.filter((issue) => !issue.EntryId || !entries.some((entry, index) => issue.EntryId === String(index) || issue.EntryId === entry.Id));

  return (
    <View testID="operations-time-report">
      <View style={styles.row}>
        <Text className="flex-1 font-semibold text-typography-900" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-typography-500" testID="operations-report-status">
          {t(`operations.reportStatus.${report.Status}`)}
        </Text>
      </View>
      {!report.CanAct ? <Text className="mt-1 text-typography-500">{t('operations.time.readOnly')}</Text> : null}
      {entries.length === 0 ? <Text className="mt-2 text-typography-500">{t('operations.time.noEntries')}</Text> : null}

      {order.map(({ entry, index }) => {
        const subjectId = subjectIdOf(entry);
        const rowEditable = editable && canWrite(subjectId);
        const label = names[subjectId] ?? '';
        return (
          <View key={entry.Id ?? `new-${index}`} className="mt-3 rounded-lg border border-outline-200 p-3" testID={`operations-entry-${index}`}>
            {entry.Id || !rowEditable ? (
              <Text className="font-semibold text-typography-900">{label || t('operations.time.subject')}</Text>
            ) : (
              <OptionChips
                options={subjectOptions}
                selected={[subjectValue(entry.SubjectType, subjectId)]}
                onToggle={(value) => setSubject(index, value)}
                accessibilityLabel={t('operations.time.subject')}
                scroll
                testID={`operations-entry-subject-${index}`}
              />
            )}
            <View className="mt-2">
              <OptionChips
                options={typeOptions}
                selected={[String(entry.EntryType)]}
                onToggle={(value) => (rowEditable ? update(index, { EntryType: Number(value) }) : undefined)}
                accessibilityLabel={t('operations.time.type')}
                testID={`operations-entry-type-${index}`}
              />
            </View>
            <View style={styles.row}>
              <Text className="mr-2 text-typography-700">{t('operations.time.from')}</Text>
              <DateTimeField
                mode="time"
                clearable={false}
                label={t('operations.time.from')}
                value={timeOf(entry.StartLocal)}
                onChange={(clock: string) => setStart(index, clock)}
                disabled={!rowEditable}
                testID={`operations-entry-start-${index}`}
              />
              <Text className="mx-2 text-typography-700">{t('operations.time.to')}</Text>
              <DateTimeField
                mode="time"
                clearable={false}
                label={t('operations.time.to')}
                value={timeOf(entry.EndLocal)}
                onChange={(clock: string) => update(index, { EndLocal: endLocalFor(entry.StartLocal, clock) })}
                disabled={!rowEditable}
                testID={`operations-entry-end-${index}`}
              />
            </View>
            {dateOf(entry.EndLocal) > dateOf(entry.StartLocal) ? <Text className="text-typography-500">{t('operations.time.nextDay')}</Text> : null}
            <View style={styles.row}>
              <Text className="flex-1 text-typography-700">{t('operations.time.unpaidBreak')}</Text>
              <Input isDisabled={!rowEditable} style={styles.small}>
                <InputField
                  value={String(entry.UnpaidBreakMinutes ?? 0)}
                  keyboardType="number-pad"
                  onChangeText={(text: string) => update(index, { UnpaidBreakMinutes: Math.max(0, Number(text) || 0) })}
                  accessibilityLabel={t('operations.time.unpaidBreak')}
                  testID={`operations-entry-break-${index}`}
                />
              </Input>
            </View>
            <View style={styles.row}>
              <Text className="flex-1 text-typography-700">{t('operations.time.meals')}</Text>
              <Switch
                value={entry.AgencySuppliedMeals}
                onValueChange={(value: boolean) => update(index, { AgencySuppliedMeals: value })}
                isDisabled={!rowEditable}
                accessibilityLabel={t('operations.time.meals')}
                testID={`operations-entry-meals-${index}`}
              />
            </View>
            <View style={styles.row}>
              <Text className="flex-1 text-typography-700">{t('operations.time.accommodation')}</Text>
              <Switch
                value={entry.AgencySuppliedAccommodation}
                onValueChange={(value: boolean) => update(index, { AgencySuppliedAccommodation: value })}
                isDisabled={!rowEditable}
                accessibilityLabel={t('operations.time.accommodation')}
              />
            </View>
            <Input isDisabled={!rowEditable} className="mt-2">
              <InputField
                value={entry.Notes ?? ''}
                placeholder={t('operations.time.notes')}
                onChangeText={(text: string) => update(index, { Notes: text || null })}
                accessibilityLabel={t('operations.time.notes')}
                testID={`operations-entry-notes-${index}`}
              />
            </Input>
            <View style={styles.row}>
              <Text className="flex-1 text-typography-500">{t('operations.time.hours', { hours: entryHours(entry) })}</Text>
              {rowEditable && isCrew && entries.length > 1 ? (
                <Button variant="link" size="sm" className="mr-2" onPress={() => onChange(applyToCrew(entries, index, canWrite))} testID={`operations-entry-apply-${index}`}>
                  <ButtonText>{t('operations.time.applyToCrew')}</ButtonText>
                </Button>
              ) : null}
              {rowEditable ? (
                <Button variant="link" action="negative" size="sm" onPress={() => remove(index)} testID={`operations-entry-remove-${index}`}>
                  <ButtonText>{t('operations.time.remove')}</ButtonText>
                </Button>
              ) : null}
            </View>
            {issueFor(index).map((issue, i) => alert(issue, `entry-${index}-${issue.Code}-${i}`, 'error'))}
          </View>
        );
      })}

      <View className="mt-2">
        {looseIssues.map((issue, i) => alert(issue, `loose-${issue.Code}-${i}`, 'error'))}
        {warnings.map((warning, i) => alert(warning, `warning-${warning.Code}-${i}`, 'warning'))}
      </View>

      {Object.keys(perSubject).length > 1 ? (
        <View className="mt-3 rounded-lg bg-background-50 p-3" testID="operations-hours-summary">
          {Object.entries(perSubject).map(([subjectId, hours]) => (
            <View key={subjectId} style={styles.row}>
              <Text className="flex-1 text-typography-800">{names[subjectId] ?? subjectId}</Text>
              <Text className="text-typography-800">{t('operations.time.hours', { hours })}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text className="mt-3 font-semibold text-typography-900" testID="operations-total-hours">
        {t('operations.time.total', { hours: sumHours(entries) })}
      </Text>

      {editable ? (
        <View className="mt-3">
          <Button variant="outline" onPress={add} isDisabled={busy || subjects.length === 0} testID="operations-add-entry">
            <ButtonText>{t('operations.time.addEntry')}</ButtonText>
          </Button>
          <Button className="mt-2" onPress={onSave} isDisabled={busy || !dirty} testID="operations-save-entries">
            <ButtonText>{t('operations.time.save')}</ButtonText>
          </Button>
          <Button className="mt-2" action="positive" onPress={onSubmit} isDisabled={busy || dirty || entries.length === 0} testID="operations-submit-report">
            <ButtonText>{t('operations.time.submit')}</ButtonText>
          </Button>
        </View>
      ) : null}

      {signable || report.ContractorSignedOn || report.CustomerSignedOn ? (
        <View className="mt-3 rounded-lg border border-outline-200 p-3" testID="operations-signatures">
          <Text className="font-semibold text-typography-900">{t('operations.sign.title')}</Text>
          <Text className="text-typography-500">
            {report.ContractorSignedOn
              ? t('operations.sign.crewBossSigned', { when: formatUtcInDepartmentTime(report.ContractorSignedOn, null, { dateStyle: 'medium', timeStyle: 'short' }) })
              : t('operations.sign.crewBossPending')}
          </Text>
          <Text className="text-typography-500">{report.CustomerSignedOn ? t('operations.sign.customerSigned', { name: report.CustomerSignerName ?? '' }) : t('operations.sign.customerPending')}</Text>
          {signable ? (
            <>
              {!report.ContractorSignedOn ? (
                <Button variant="outline" className="mt-2" onPress={() => onSign(true)} isDisabled={busy || dirty} testID="operations-sign-crew-boss">
                  <ButtonText>{t('operations.sign.asCrewBoss')}</ButtonText>
                </Button>
              ) : null}
              <Input className="mt-2">
                <InputField
                  value={customerSigner}
                  placeholder={t('operations.sign.customerName')}
                  onChangeText={setCustomerSigner}
                  maxLength={200}
                  accessibilityLabel={t('operations.sign.customerName')}
                  testID="operations-sign-customer-name"
                />
              </Input>
              <Button
                variant="outline"
                className="mt-2"
                onPress={() => {
                  onSign(false, customerSigner.trim());
                  setCustomerSigner('');
                }}
                isDisabled={busy || dirty || !customerSigner.trim()}
                testID="operations-sign-customer"
              >
                <ButtonText>{t('operations.sign.recordCustomer')}</ButtonText>
              </Button>
            </>
          ) : null}
        </View>
      ) : null}

      {canApprove && report.Status === TimeReportStatus.Submitted ? (
        <Button className="mt-3" action="positive" onPress={onApprove} isDisabled={busy} testID="operations-approve-report">
          <ButtonText>{t('operations.time.approve')}</ButtonText>
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  small: { width: 80 },
});
