import '../../calendar/__tests__/test-setup';

import { useCertificationsStore } from '@resgrid/data';
import type { Certification, CertificationType } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { addMonths, certificationErrorKey, expiryState, formatDay, hoursOf, isDateKey, optionalDate, sortCertifications, statusAction, summarize, todayKey, validateCertificationForm } from '../lib/certification-format';
import { certificationsNav } from '../nav';
import { certificationsRoutes, parseCertificationId } from '../routes';
import CertificationDetailScreen from '../screens/certification-detail';
import CertificationEditScreen from '../screens/certification-edit';
import CertificationsListScreen from '../screens/certifications-list';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://photo.jpg', base64: 'QUJD', mimeType: 'image/jpeg' }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

const q = { includeHiddenElements: true } as const;

const cert = (Id: number, extra: Partial<Certification> = {}): Certification => ({ Id, UserId: 'me', Name: `Cert ${Id}`, Status: 0, HasFile: false, CreditHours: 0, ...extra });
const type = (Id: number, Name: string, extra: Partial<CertificationType> = {}): CertificationType => ({
  Id,
  Code: `T${Id}`,
  Name,
  Category: 0,
  AppliesTo: 0,
  NeverExpires: false,
  RequiresVerification: false,
  IsActive: true,
  ...extra,
});

/** A calendar day `months` from today on the given day of the month, as the date picker produces it. */
const pickedDay = (months: number, day: number): string => {
  const now = new Date();
  return todayKey(new Date(now.getFullYear(), now.getMonth() + months, day));
};

/** Opens a DateTimeField, moves `months` from the month it shows (its value, else today's), picks `day` and confirms. */
const pickDate = async (testID: string, months: number, day: number) => {
  await fireEvent.press(screen.getByTestId(testID));
  for (let step = 0; step < Math.abs(months); step += 1) await fireEvent.press(screen.getByTestId(`${testID}-${months > 0 ? 'next' : 'previous'}`, q));
  await fireEvent.press(screen.getByTestId(`${testID}-day-${day}`, q));
  await fireEvent.press(screen.getByTestId(`${testID}-done`, q));
};

/** The type sheet tears its modal down when its close animation ends. */
const settleSheet = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

const store = {
  fetchCertifications: jest.fn(async () => undefined),
  fetchTypes: jest.fn(async () => undefined),
  fetchCertification: jest.fn(async () => null),
  fetchCredits: jest.fn(async () => undefined),
  save: jest.fn(async (): Promise<Certification | null> => cert(42)),
  renew: jest.fn(async (): Promise<Certification | null> => cert(5)),
  remove: jest.fn(async () => true),
  addCredit: jest.fn(async () => true),
};

beforeEach(() => {
  Object.values(store).forEach((fn) => fn.mockClear());
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useCertificationsStore.setState({ certifications: [], certificationsById: {}, creditsByCertification: {}, types: [], loading: {}, errors: {}, actionError: null, ...store });
});

// Saving and removing confirm with a toast; its dismiss timer would outlive the test.
afterEach(() => useToastStore.getState().clearToasts());

describe('certification format', () => {
  it('validates calendar days and hours within Core limits', () => {
    expect(optionalDate('')).toEqual({ ok: true, value: null });
    expect(optionalDate(' 2026-04-01 ')).toEqual({ ok: true, value: '2026-04-01' });
    expect(optionalDate('04/01/2026').ok).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(hoursOf('1,5')).toBe(1.5);
    expect(hoursOf('9999')).toBe(9999);
    expect(hoursOf('10000')).toBeNull();
    expect(hoursOf('0')).toBeNull();
    expect(hoursOf('')).toBeNull();
  });

  it('adds months keeping the day where the month has it, and formats days for the reader', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-02', 24)).toBe('2028-11-02');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
    expect(formatDay('2026-12-01T00:00:00', 'en')).toBe('Dec 1, 2026');
    expect(formatDay('', 'en')).toBe('');
  });

  it('classifies expiry and status, and counts the list summary', () => {
    expect(expiryState({ Status: 0, ExpiresOn: null })).toBe('none');
    expect(expiryState({ Status: 0, ExpiresOn: '2026-12-01', DaysUntilExpiry: 30 })).toBe('soon');
    expect(expiryState({ Status: 0, ExpiresOn: '2027-12-01', DaysUntilExpiry: 400 })).toBe('ok');
    expect(expiryState({ Status: 0, ExpiresOn: '2026-01-01', DaysUntilExpiry: -5 })).toBe('expired');
    expect(expiryState({ Status: 1, ExpiresOn: null })).toBe('expired');
    expect([0, 1, 2, 3, 4, 5].map(statusAction)).toEqual(['success', 'error', 'warning', 'error', 'info', 'muted']);
    expect(summarize([cert(1), cert(2, { ExpiresOn: '2026-12-01', DaysUntilExpiry: 3 }), cert(3, { Status: 1 })])).toEqual({ total: 3, soon: 1, expired: 1 });
  });

  it('checks the form the way Core would refuse it', () => {
    const base = { isOther: false, hasType: true, name: '', receivedOn: '', expiresOn: '' };
    expect(validateCertificationForm(base, '2026-11-02')).toEqual({});
    expect(validateCertificationForm({ ...base, hasType: false }, '2026-11-02')).toEqual({ type: 'certifications.validation.typeRequired' });
    expect(validateCertificationForm({ ...base, isOther: true, name: '  ' }, '2026-11-02')).toEqual({ name: 'certifications.validation.nameRequired' });
    expect(validateCertificationForm({ ...base, receivedOn: '2026-12-01' }, '2026-11-02')).toEqual({ receivedOn: 'certifications.validation.receivedInFuture' });
    expect(validateCertificationForm({ ...base, receivedOn: '2026-01-01', expiresOn: '2025-12-31' }, '2026-11-02')).toEqual({ expiresOn: 'certifications.validation.expiresBeforeReceived' });
  });

  it('sorts by soonest expiry with non-expiring last', () => {
    const sorted = sortCertifications([cert(1, { ExpiresOn: null }), cert(2, { ExpiresOn: '2027-01-01' }), cert(3, { ExpiresOn: '2026-12-01' })]);
    expect(sorted.map((item) => item.Id)).toEqual([3, 2, 1]);
  });

  it("maps Core's reasons and failure kinds to text that says what to do", () => {
    expect(certificationErrorKey({ code: 'rejected', status: 400, problemType: 'certifications_file_too_large', messageKey: 'errors.data.rejected' })).toBe('certifications.errors.certifications_file_too_large');
    expect(certificationErrorKey({ code: 'rejected', status: 400, problemType: 'certifications_type_not_found', messageKey: 'errors.data.rejected' })).toBe('certifications.errors.typeUnavailable');
    expect(certificationErrorKey({ code: 'rejected', status: 400, problemType: 'certifications_expiry_not_later', messageKey: 'errors.data.rejected' })).toBe('certifications.errors.expiryNotLater');
    expect(certificationErrorKey({ code: 'forbidden', status: 403, problemType: 'protected_data_required', messageKey: 'errors.data.forbidden' })).toBe('certifications.errors.locked');
    // A bare 400 (model binding) has a URL problem type that is not a reason.
    expect(certificationErrorKey({ code: 'rejected', status: 400, problemType: 'https://tools.ietf.org/html/rfc9110#section-15.5.1', messageKey: 'errors.data.rejected' })).toBe('certifications.errors.rejected');
    expect(certificationErrorKey({ code: 'network', messageKey: 'errors.data.network' })).toBe('certifications.errors.offline');
    expect(certificationErrorKey({ code: 'server', status: 500, messageKey: 'errors.data.server' })).toBe('certifications.errors.server');
    expect(certificationErrorKey({ code: 'unauthorized', status: 401, messageKey: 'errors.data.unauthorized' })).toBe('errors.data.unauthorized');
  });

  it('builds numeric-only routes and the nav entry', () => {
    expect(certificationsRoutes.detail(5)).toBe('/certifications/5');
    expect(certificationsRoutes.edit()).toBe('/certifications/edit');
    expect(certificationsRoutes.edit(5)).toBe('/certifications/edit?id=5');
    expect(certificationsRoutes.detail('../calls')).toBeNull();
    expect(parseCertificationId('12')).toBe(12);
    expect(parseCertificationId('abc')).toBeNull();
    expect(certificationsNav).toEqual([expect.objectContaining({ id: 'certifications', href: '/certifications', requiresModule: 'certifications' })]);
  });

  it('captures a photo as base64 and refuses without permission', async () => {
    await expect(capturePhoto('camera', 'card')).resolves.toEqual({ base64: 'QUJD', name: 'card.jpg', contentType: 'image/jpeg' });
    await expect(capturePhoto('library', 'card.jpg')).resolves.toBeNull();
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await expect(capturePhoto('camera', 'card')).rejects.toBeInstanceOf(PhotoPermissionError);
  });
});

describe('CertificationsListScreen', () => {
  it('loads the member records and types, summarizes them, lists them soonest expiry first and opens one', async () => {
    useCertificationsStore.setState({
      certifications: [
        cert(1),
        cert(2, { ExpiresOn: '2026-12-01', DaysUntilExpiry: 30, Number: 'EMT-9', IssuedBy: 'State EMS', CreditHours: 4, CreditHoursRequired: 24 }),
        cert(3, { Status: 1, ExpiresOn: '2026-01-01', DaysUntilExpiry: -300 }),
      ],
    });
    await render(<CertificationsListScreen />);
    await waitFor(() => expect(store.fetchCertifications).toHaveBeenCalledWith(undefined, { bypassCache: false }));
    expect(store.fetchTypes).toHaveBeenCalledWith({ appliesTo: 0, bypassCache: false });

    const rows = screen.getAllByTestId(/^certification-\d+$/);
    expect(rows.map((row) => row.props.testID)).toEqual(['certification-3', 'certification-2', 'certification-1']);
    expect(screen.getByTestId('certification-2-expiry')).toHaveTextContent('certifications.expires:Dec 1, 2026');
    expect(screen.getByTestId('certification-3-expiry')).toHaveTextContent('certifications.expired:Jan 1, 2026');
    expect(screen.getByTestId('certification-1-expiry')).toHaveTextContent('certifications.noExpiry');
    expect(screen.getByTestId('certification-3-status')).toHaveTextContent('certifications.status.1');
    expect(screen.getByText('certifications.numberIs:EMT-9 · State EMS')).toBeTruthy();
    expect(screen.getByText('certifications.credits:4,24')).toBeTruthy();
    expect(screen.getByTestId('certifications-summary-total')).toHaveTextContent(/^3/);
    expect(screen.getByTestId('certifications-summary-soon')).toHaveTextContent(/^1/);
    expect(screen.getByTestId('certifications-summary-expired')).toHaveTextContent(/^1/);

    await fireEvent.press(screen.getByTestId('certification-2'));
    expect(router.push).toHaveBeenCalledWith('/certifications/2');
    await fireEvent.press(screen.getByTestId('certifications-add'));
    expect(router.push).toHaveBeenLastCalledWith('/certifications/edit');
  });

  it('offers to add the first one when there are none, and explains a failed load', async () => {
    const { unmount } = await render(<CertificationsListScreen />);
    expect(screen.getByTestId('certifications-empty')).toBeTruthy();
    expect(screen.queryByTestId('certifications-add')).toBeNull();
    await fireEvent.press(screen.getByTestId('certifications-empty-add'));
    expect(router.push).toHaveBeenLastCalledWith('/certifications/edit');
    await unmount();

    useCertificationsStore.setState({ errors: { mine: { code: 'network', messageKey: 'errors.data.network' } } });
    await render(<CertificationsListScreen />);
    expect(screen.getByText('certifications.loadFailed')).toBeTruthy();
    expect(screen.getByText('certifications.errors.offline')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('certifications-retry'));
    await waitFor(() => expect(store.fetchCertifications).toHaveBeenLastCalledWith(undefined, { bypassCache: true }));
  });
});

describe('CertificationDetailScreen', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '5' });
    useCertificationsStore.setState({
      certificationsById: {
        5: cert(5, { TypeName: 'EMT-Basic', Number: 'E-1', IssuedBy: 'State EMS', ExpiresOn: '2026-12-01T00:00:00', DaysUntilExpiry: 30, CreditHours: 4, CreditHoursRequired: 24, VerifiedOn: '2026-01-02' }),
      },
      creditsByCertification: { 5: [{ Id: 9, CertificationId: 5, CreditDate: '2026-10-01', Hours: 2, Category: 'Drill', HasFile: true }] },
    });
  });

  it('loads the record and its hours and shows the details', async () => {
    await render(<CertificationDetailScreen />);
    await waitFor(() => expect(store.fetchCertification).toHaveBeenCalledWith(5, { bypassCache: true }));
    expect(store.fetchCredits).toHaveBeenCalledWith(5);
    expect(screen.getByTestId('certification-status')).toHaveTextContent('certifications.status.0');
    expect(screen.getByTestId('certification-expiry')).toHaveTextContent('certifications.expires:Dec 1, 2026');
    expect(screen.getByText('State EMS')).toBeTruthy();
    expect(screen.getByTestId('certification-verification')).toHaveTextContent(/certifications\.verifiedOn:Jan 2, 2026/);
    expect(screen.getByTestId('certification-credit-total')).toHaveTextContent(/certifications\.credits:4,24/);
    expect(screen.getByTestId('certification-credit-9')).toHaveTextContent(/certifications\.hoursShort:2.*Oct 1, 2026.*Drill/);
    expect(screen.getByLabelText('certifications.certificateAttached')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('certification-edit'));
    expect(router.push).toHaveBeenCalledWith('/certifications/edit?id=5');
  });

  it('asks for a later expiry before renewing, then renews with a new number', async () => {
    useCertificationsStore.setState({ certificationsById: { 5: cert(5, { TypeName: 'EMT-Basic', Number: 'E-1', ExpiresOn: todayKey(), DaysUntilExpiry: 0 }) } });
    await render(<CertificationDetailScreen />);
    await fireEvent.press(screen.getByTestId('certification-renew-save'));
    expect(screen.getByTestId('certification-error')).toHaveTextContent('certifications.errors.expiryRequired');

    await pickDate('certification-renew-date', -1, 1);
    await fireEvent.press(screen.getByTestId('certification-renew-save'));
    expect(screen.getByTestId('certification-error')).toHaveTextContent(/^certifications\.renewExpiryNotLater:/);
    expect(store.renew).not.toHaveBeenCalled();

    // The picker reopens on last month's pick.
    await pickDate('certification-renew-date', 2, 15);
    await fireEvent.changeText(screen.getByTestId('certification-renew-number'), ' E-2 ');
    await fireEvent.press(screen.getByTestId('certification-renew-save'));
    await waitFor(() => expect(store.renew).toHaveBeenCalledWith({ Id: 5, ExpiresOn: pickedDay(1, 15), Number: 'E-2' }));
    expect(await screen.findByTestId('certification-message')).toHaveTextContent('certifications.renewed');
  });

  it("shows Core's reason when a renewal is refused", async () => {
    store.renew.mockImplementationOnce(async () => {
      useCertificationsStore.setState({ actionError: { code: 'rejected', status: 400, problemType: 'certifications_expiry_not_later', messageKey: 'errors.data.rejected' } });
      return null;
    });
    useCertificationsStore.setState({ certificationsById: { 5: cert(5, { Status: 1, ExpiresOn: '2025-01-01', DaysUntilExpiry: -600 }) } });
    await render(<CertificationDetailScreen />);
    await pickDate('certification-renew-date', 1, 15);
    await fireEvent.press(screen.getByTestId('certification-renew-save'));
    await waitFor(() => expect(screen.getByTestId('certification-error')).toHaveTextContent('certifications.renewFailedTitlecertifications.errors.expiryNotLater'));
  });

  it('logs continuing-education hours, with a photo, and refreshes the hour total', async () => {
    await render(<CertificationDetailScreen />);
    await fireEvent.changeText(screen.getByTestId('certification-credit-hours'), 'abc');
    await fireEvent.press(screen.getByTestId('certification-credit-save'));
    expect(screen.getByTestId('certification-error')).toHaveTextContent('certifications.hoursInvalid');
    expect(store.addCredit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('certification-credit-hours'), '2,5');
    await fireEvent.changeText(screen.getByTestId('certification-credit-category'), 'Course');
    await fireEvent.press(screen.getByTestId('certification-credit-camera'));
    await waitFor(() =>
      expect(store.addCredit).toHaveBeenCalledWith({ CertificationId: 5, CreditDate: null, Hours: 2.5, Category: 'Course', Description: null, FileData: 'QUJD', FileName: 'ce-certificate.jpg', FileType: 'image/jpeg' })
    );
    await waitFor(() => expect(store.fetchCertification).toHaveBeenLastCalledWith(5, { bypassCache: true }));
    expect(await screen.findByTestId('certification-message')).toHaveTextContent('certifications.creditAdded');
  });

  it('removes after confirmation, and keeps the screen with the reason on failure', async () => {
    store.remove.mockImplementationOnce(async () => {
      useCertificationsStore.setState({ actionError: { code: 'forbidden', status: 403, messageKey: 'errors.data.forbidden' } });
      return false;
    });
    await render(<CertificationDetailScreen />);
    await fireEvent.press(screen.getByTestId('certification-remove'));
    await fireEvent.press(screen.getByTestId('certification-remove-confirm-confirm', q));
    await waitFor(() => expect(screen.getByTestId('certification-error')).toHaveTextContent('certifications.removeFailedTitlecertifications.errors.denied'));
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('certification-remove'));
    await fireEvent.press(screen.getByTestId('certification-remove-confirm-confirm', q));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(store.remove).toHaveBeenLastCalledWith(5);
  });

  it('says so for an id that is not a certification', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'x' });
    await render(<CertificationDetailScreen />);
    expect(screen.getByTestId('certification-invalid')).toBeTruthy();
  });
});

describe('CertificationEditScreen', () => {
  it('asks for a certification, then adds a named one with Id 0 and opens it', async () => {
    useCertificationsStore.setState({ types: [type(3, 'Paramedic')] });
    await render(<CertificationEditScreen />);
    expect(store.fetchTypes).not.toHaveBeenCalled();
    expect(screen.queryByTestId('certification-name')).toBeNull();
    await fireEvent.press(screen.getByTestId('certification-save'));
    expect(screen.getByTestId('certification-type-field-error')).toHaveTextContent('certifications.validation.typeRequired');
    expect(screen.getByTestId('certification-form-message')).toHaveTextContent('certifications.validation.fixFields');
    expect(store.save).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('certification-type'));
    await fireEvent.press(screen.getByTestId('certification-type-sheet-option-other', q));
    await settleSheet();
    await fireEvent.press(screen.getByTestId('certification-save'));
    expect(screen.getByTestId('certification-name-field-error')).toHaveTextContent('certifications.validation.nameRequired');

    await fireEvent.changeText(screen.getByTestId('certification-name'), 'Swift water rescue');
    expect(screen.queryByTestId('certification-form-message')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('certification-number'), ' SW-7 ');
    await fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() =>
      expect(store.save).toHaveBeenCalledWith({
        Id: 0,
        TypeId: null,
        Name: 'Swift water rescue',
        Number: 'SW-7',
        IssuedBy: null,
        Area: null,
        ReceivedOn: null,
        ExpiresOn: null,
        FileData: null,
        FileName: null,
        FileType: null,
      })
    );
    expect(router.replace).toHaveBeenCalledWith('/certifications/42');
  });

  it('goes straight to the name when the department has no catalog', async () => {
    await render(<CertificationEditScreen />);
    expect(store.fetchTypes).toHaveBeenCalledWith({ appliesTo: 0 });
    expect(screen.getByTestId('certification-name')).toBeTruthy();
  });

  it('picks a catalog type and fills the expiry from its validity and the issue date', async () => {
    useCertificationsStore.setState({ types: [type(3, 'Paramedic', { DefaultValidityMonths: 24, RequiresVerification: true }), type(4, 'Retired', { IsActive: false })] });
    await render(<CertificationEditScreen />);
    await fireEvent.press(screen.getByTestId('certification-type'));
    expect(screen.queryByTestId('certification-type-sheet-option-4', q)).toBeNull();
    await fireEvent.press(screen.getByTestId('certification-type-sheet-option-3', q));
    expect(screen.queryByTestId('certification-name')).toBeNull();
    await settleSheet();
    expect(screen.getByTestId('certification-type-field-hint')).toHaveTextContent('certifications.form.verificationHint');
    expect(screen.getByTestId('certification-expires-field-hint')).toHaveTextContent('certifications.form.validityHint:24');

    await pickDate('certification-received', -1, 1);
    expect(screen.getByTestId('certification-expires-field-hint')).toHaveTextContent('certifications.form.expiresAuto:24');
    await fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ Id: 0, TypeId: 3, Name: null, ReceivedOn: pickedDay(-1, 1), ExpiresOn: addMonths(pickedDay(-1, 1), 24) })));
  });

  it('attaches a photo of the card and lets the member take it off again', async () => {
    await render(<CertificationEditScreen />);
    await fireEvent.press(screen.getByTestId('certification-camera'));
    expect(await screen.findByTestId('certification-photo-attached')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('certification-photo-remove'));
    expect(screen.queryByTestId('certification-photo-attached')).toBeNull();

    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await fireEvent.press(screen.getByTestId('certification-library'));
    expect(await screen.findByTestId('certification-photo-error')).toHaveTextContent('certifications.photoDenied');
  });

  it('keeps the entries and says what to do when Core refuses the save, pointing at the field', async () => {
    store.save.mockImplementationOnce(async () => {
      useCertificationsStore.setState({ actionError: { code: 'rejected', status: 400, problemType: 'certifications_type_not_found', messageKey: 'errors.data.rejected' } });
      return null;
    });
    store.save.mockImplementationOnce(async () => {
      useCertificationsStore.setState({ actionError: { code: 'network', messageKey: 'errors.data.network' } });
      return null;
    });
    useCertificationsStore.setState({ types: [type(3, 'Paramedic')] });
    await render(<CertificationEditScreen />);
    await fireEvent.press(screen.getByTestId('certification-type'));
    await fireEvent.press(screen.getByTestId('certification-type-sheet-option-3', q));
    await settleSheet();
    await fireEvent.changeText(screen.getByTestId('certification-number'), 'P-1');

    await fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() => expect(screen.getByTestId('certification-form-message')).toHaveTextContent('certifications.saveFailedTitlecertifications.errors.typeUnavailable'));
    expect(screen.getByTestId('certification-type-field-error')).toHaveTextContent('certifications.errors.typeUnavailable');
    expect(screen.getByTestId('certification-number')).toHaveProp('value', 'P-1');
    expect(router.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() => expect(screen.getByTestId('certification-form-message')).toHaveTextContent('certifications.saveFailedTitlecertifications.errors.offline'));
  });

  it('seeds the form from an existing record, and reads one the list does not hold', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '7' });
    useCertificationsStore.setState({ certifications: [cert(7, { Name: 'Hazmat', Number: 'H-1', ExpiresOn: '2027-05-01T00:00:00' })] });
    const { unmount } = await render(<CertificationEditScreen />);
    expect(screen.getByTestId('certification-name')).toHaveProp('value', 'Hazmat');
    expect(screen.getByTestId('certification-number')).toHaveProp('value', 'H-1');
    expect(store.fetchCertification).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ Id: 7, Name: 'Hazmat', ExpiresOn: '2027-05-01' })));
    await unmount();

    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '8' });
    await render(<CertificationEditScreen />);
    await waitFor(() => expect(store.fetchCertification).toHaveBeenCalledWith(8));
    expect(screen.queryByTestId('certification-save')).toBeNull();
  });

  it('waits for a record it reads, then says it is missing when Core has none (not_found carries no error)', async () => {
    let resolveRead: (value: null) => void = () => undefined;
    store.fetchCertification.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveRead = resolve;
        })
    );
    await render(<CertificationEditScreen certificationId={8} />);
    expect(store.fetchCertification).toHaveBeenCalledWith(8);
    expect(screen.queryByTestId('certification-edit-error')).toBeNull();
    expect(screen.queryByTestId('certification-save')).toBeNull();

    await act(async () => resolveRead(null));
    expect(screen.getByTestId('certification-edit-error')).toHaveTextContent(/certifications\.errors\.notFound/);
    expect(screen.queryByTestId('certification-save')).toBeNull();
    await fireEvent.press(screen.getByTestId('certification-edit-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it("shows why a record it reads could not be loaded, not another record's earlier failure", async () => {
    useCertificationsStore.setState({ errors: { detail: { code: 'rejected', status: 400, messageKey: 'errors.data.rejected' } } });
    let failRead: () => void = () => undefined;
    store.fetchCertification.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          failRead = () => {
            useCertificationsStore.setState({ errors: { detail: { code: 'network', messageKey: 'errors.data.network' } } });
            resolve(null);
          };
        })
    );
    await render(<CertificationEditScreen certificationId={9} />);
    expect(screen.queryByTestId('certification-edit-error')).toBeNull();

    await act(async () => failRead());
    expect(screen.getByTestId('certification-edit-error')).toHaveTextContent(/certifications\.errors\.offline/);
    expect(screen.queryByTestId('certification-save')).toBeNull();
  });
});
