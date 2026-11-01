import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type Expense, ExpenseType, type SaveExpenseInput } from '@resgrid/models';
import { Button, ButtonText, Input, InputField, Text } from '@resgrid/ui';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { dateOf } from '../lib/time';

export type ExpenseAddOutcome = 'sent' | 'queued' | 'rejected';

export interface ExpensesPanelProps {
  dateKey: string;
  currency?: string | null;
  expenses: Expense[];
  /** The open report the expense belongs to, when the person may act on it. */
  reportId: string | null;
  userId: string | null;
  canManage: boolean;
  canAdd: boolean;
  busy: boolean;
  onAdd: (input: Omit<SaveExpenseInput, 'DeploymentId'>) => Promise<ExpenseAddOutcome>;
  onRemove: (id: string) => Promise<boolean>;
}

interface Receipt {
  base64: string;
  name: string;
  contentType: string;
}

const amountOf = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
};

/**
 * Field expenses against the deployment (fuel, meals, lodging, restock) with an optional receipt photo, filed by the
 * server as a Receipt attachment. Expenses queue offline (Unit offline scope) and replay once; a member removes only
 * the expenses they added (a manager any), after an inline confirmation.
 */
export const ExpensesPanel: React.FC<ExpensesPanelProps> = ({ dateKey, currency, expenses, reportId, userId, canManage, canAdd, busy, onAdd, onRemove }) => {
  const { t } = useTranslation();
  const [type, setType] = useState(String(ExpenseType.Fuel));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const typeOptions = Object.values(ExpenseType).map((value) => ({ value: String(value), label: t(`operations.expenses.type.${value}`) }));
  const day = expenses.filter((expense) => dateOf(expense.ExpenseDate) === dateKey);
  const others = expenses.filter((expense) => dateOf(expense.ExpenseDate) !== dateKey);

  const pick = async (source: 'camera' | 'library') => {
    setMessage(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setMessage(t('operations.expenses.photoDenied'));
          return;
        }
      }
      // exif: false — no GPS or device metadata travels with the receipt.
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: true, exif: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (asset?.base64) setReceipt({ base64: asset.base64, name: `receipt-${dateKey}.jpg`, contentType: asset.mimeType ?? 'image/jpeg' });
    } catch {
      setMessage(t('operations.expenses.photoDenied'));
    }
  };

  const add = async () => {
    const value = amountOf(amount);
    if (value == null) {
      setMessage(t('operations.expenses.amountInvalid'));
      return;
    }
    const outcome = await onAdd({
      ExpenseDate: dateKey,
      ExpenseType: Number(type),
      Amount: value,
      Currency: currency ?? null,
      Description: description.trim() || null,
      City: city.trim() || null,
      TimeReportId: reportId,
      ReceiptData: receipt?.base64 ?? null,
      ReceiptFileName: receipt?.name ?? null,
      ReceiptContentType: receipt?.contentType ?? null,
    });
    if (outcome === 'rejected') {
      setMessage(t('operations.errors.validation'));
      return;
    }
    setReceipt(null);
    setAmount('');
    setDescription('');
    setCity('');
    setMessage(outcome === 'sent' ? t('operations.expenses.saved') : t('operations.expenses.queued'));
  };

  const row = (expense: Expense) => {
    const canRemove = canManage || (!!userId && expense.AddedByUserId === userId);
    return (
      <View key={expense.Id} className="mb-2 rounded-lg border border-outline-200 p-2" testID={`operations-expense-${expense.Id}`}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text className="font-semibold text-typography-900">{`${t(`operations.expenses.type.${expense.ExpenseType}`)} · ${expense.Amount.toFixed(2)} ${expense.Currency ?? ''}`.trim()}</Text>
            <Text size="sm" className="text-typography-500">
              {[dateOf(expense.ExpenseDate), expense.Description, expense.City, expense.ReceiptAttachmentId ? t('operations.expenses.hasReceipt') : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {canRemove && confirmingId !== expense.Id ? (
            <Button variant="link" action="negative" size="sm" onPress={() => setConfirmingId(expense.Id)} isDisabled={busy} testID={`operations-expense-remove-${expense.Id}`}>
              <ButtonText>{t('operations.expenses.remove')}</ButtonText>
            </Button>
          ) : null}
        </View>
        {confirmingId === expense.Id ? (
          <View className="mt-2" accessibilityRole="alert" testID={`operations-expense-confirm-${expense.Id}`}>
            <Text size="sm" className="font-semibold text-typography-900">
              {t('operations.expenses.removeTitle')}
            </Text>
            <Text size="sm" className="text-typography-600">
              {t('operations.expenses.removeBody')}
            </Text>
            <View style={styles.row}>
              <Button variant="outline" size="sm" className="mr-2" onPress={() => setConfirmingId(null)} testID={`operations-expense-cancel-${expense.Id}`}>
                <ButtonText>{t('operations.expenses.cancel')}</ButtonText>
              </Button>
              <Button
                action="negative"
                size="sm"
                isDisabled={busy}
                onPress={() => {
                  setConfirmingId(null);
                  void onRemove(expense.Id);
                }}
                testID={`operations-expense-confirm-remove-${expense.Id}`}
              >
                <ButtonText>{t('operations.expenses.remove')}</ButtonText>
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View testID="operations-expenses">
      {day.length === 0 ? <Text className="text-typography-500">{t('operations.expenses.noneToday')}</Text> : day.map(row)}
      {canAdd ? (
        <View className="mt-3 rounded-lg border border-outline-200 p-3" testID="operations-expense-form">
          <Text className="mb-2 font-semibold text-typography-900">{t('operations.expenses.add')}</Text>
          <OptionChips options={typeOptions} selected={[type]} onToggle={setType} accessibilityLabel={t('operations.expenses.typeLabel')} testID="operations-expense-type" />
          <Input className="mt-2">
            <InputField
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={t('operations.expenses.amount', { currency: currency ?? '' })}
              accessibilityLabel={t('operations.expenses.amount', { currency: currency ?? '' })}
              testID="operations-expense-amount"
            />
          </Input>
          <Input className="mt-2">
            <InputField
              value={description}
              onChangeText={setDescription}
              placeholder={t('operations.expenses.description')}
              maxLength={500}
              accessibilityLabel={t('operations.expenses.description')}
              testID="operations-expense-description"
            />
          </Input>
          <Input className="mt-2">
            <InputField value={city} onChangeText={setCity} placeholder={t('operations.expenses.city')} maxLength={200} accessibilityLabel={t('operations.expenses.city')} testID="operations-expense-city" />
          </Input>
          <View style={styles.row}>
            <Button variant="outline" size="sm" className="mr-2" onPress={() => void pick('camera')} testID="operations-expense-camera">
              <ButtonText>{t('operations.expenses.takePhoto')}</ButtonText>
            </Button>
            <Button variant="outline" size="sm" onPress={() => void pick('library')} testID="operations-expense-library">
              <ButtonText>{t('operations.expenses.choosePhoto')}</ButtonText>
            </Button>
          </View>
          {receipt ? <Text className="mt-1 text-typography-500">{t('operations.expenses.receiptAttached')}</Text> : null}
          <Button className="mt-2" onPress={() => void add()} isDisabled={busy || !amount.trim()} testID="operations-expense-save">
            <ButtonText>{t('operations.expenses.save')}</ButtonText>
          </Button>
        </View>
      ) : null}
      {message ? (
        <Text className="mt-2 text-typography-600" accessibilityLiveRegion="polite" testID="operations-expense-message">
          {message}
        </Text>
      ) : null}
      {others.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1 font-semibold text-typography-900">{t('operations.expenses.otherDays')}</Text>
          {others.map(row)}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  grow: { flex: 1 },
});
