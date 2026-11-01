import '../../calendar/__tests__/test-setup';

import { useCertificationsStore } from '@resgrid/data';
import type { Certification, CertificationType } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { certificationErrorKey, hoursOf, isDateKey, optionalDate, sortCertifications } from '../lib/certification-format';
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

describe('certification format', () => {
  it('validates calendar days and hours', () => {
    expect(optionalDate('')).toEqual({ ok: true, value: null });
    expect(optionalDate(' 2026-04-01 ')).toEqual({ ok: true, value: '2026-04-01' });
    expect(optionalDate('04/01/2026').ok).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(hoursOf('1,5')).toBe(1.5);
    expect(hoursOf('0')).toBeNull();
    expect(hoursOf('')).toBeNull();
  });

  it('sorts by soonest expiry with non-expiring last, and maps module errors', () => {
    const sorted = sortCertifications([cert(1, { ExpiresOn: null }), cert(2, { ExpiresOn: '2027-01-01' }), cert(3, { ExpiresOn: '2026-12-01' })]);
    expect(sorted.map((item) => item.Id)).toEqual([3, 2, 1]);
    expect(certificationErrorKey({ code: 'rejected', status: 400, problemType: 'certifications_file_too_large', messageKey: 'errors.data.rejected' })).toBe('certifications.errors.certifications_file_too_large');
    expect(certificationErrorKey({ code: 'forbidden', status: 403, problemType: 'protected_data_required', messageKey: 'errors.data.forbidden' })).toBe('certifications.errors.locked');
    expect(certificationErrorKey({ code: 'network', messageKey: 'errors.data.network' })).toBe('errors.data.network');
  });

  it('builds numeric-only routes and the nav entry', () => {
    expect(certificationsRoutes.detail(5)).toBe('/certifications/5');
    expect(certificationsRoutes.edit()).toBe('/certifications/edit');
    expect(certificationsRoutes.edit(5)).toBe('/certifications/edit?id=5');
    expect(() => certificationsRoutes.detail('../calls')).toThrow();
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
  it('loads the member records and types, lists them soonest expiry first and opens one', async () => {
    useCertificationsStore.setState({ certifications: [cert(1), cert(2, { ExpiresOn: '2026-12-01', DaysUntilExpiry: 30, Number: 'EMT-9', CreditHours: 4, CreditHoursRequired: 24 })] });
    render(<CertificationsListScreen />);
    await waitFor(() => expect(store.fetchCertifications).toHaveBeenCalledWith(undefined, { bypassCache: false }));
    expect(store.fetchTypes).toHaveBeenCalledWith({ appliesTo: 0, bypassCache: false });

    const rows = screen.getAllByTestId(/^certification-\d+$/);
    expect(rows.map((row) => row.props.testID)).toEqual(['certification-2', 'certification-1']);
    expect(screen.getByTestId('certification-2-expiry')).toHaveTextContent('certifications.expires:2026-12-01,30');
    expect(screen.getByTestId('certification-1-expiry')).toHaveTextContent('certifications.noExpiry');
    expect(screen.getByText('certifications.credits:4,24')).toBeTruthy();

    fireEvent.press(screen.getByTestId('certification-2'));
    expect(router.push).toHaveBeenCalledWith('/certifications/2');
    fireEvent.press(screen.getByTestId('certifications-add'));
    expect(router.push).toHaveBeenLastCalledWith('/certifications/edit');
  });

  it('shows the empty and error states', () => {
    const { unmount } = render(<CertificationsListScreen />);
    expect(screen.getByTestId('certifications-empty')).toBeTruthy();
    unmount();
    useCertificationsStore.setState({ errors: { mine: { code: 'server', status: 500, messageKey: 'errors.data.server' } } });
    render(<CertificationsListScreen />);
    expect(screen.getByText('errors.data.server')).toBeTruthy();
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
    render(<CertificationDetailScreen />);
    await waitFor(() => expect(store.fetchCertification).toHaveBeenCalledWith(5, { bypassCache: true }));
    expect(store.fetchCredits).toHaveBeenCalledWith(5);
    expect(screen.getByTestId('certification-status')).toHaveTextContent('certifications.status.0');
    expect(screen.getByText('certifications.issuedByIs:State EMS')).toBeTruthy();
    expect(screen.getByText('certifications.verifiedOn:2026-01-02')).toBeTruthy();
    expect(screen.getByTestId('certification-credit-9')).toHaveTextContent('2026-10-01 · 2 h · Drill · certifications.certificateAttached');
    fireEvent.press(screen.getByTestId('certification-edit'));
    expect(router.push).toHaveBeenCalledWith('/certifications/edit?id=5');
  });

  it('renews with a new number', async () => {
    render(<CertificationDetailScreen />);
    fireEvent.changeText(screen.getByTestId('certification-renew-number'), ' E-2 ');
    fireEvent.press(screen.getByTestId('certification-renew-save'));
    await waitFor(() => expect(store.renew).toHaveBeenCalledWith({ Id: 5, ExpiresOn: null, Number: 'E-2' }));
    expect(await screen.findByTestId('certification-message')).toHaveTextContent('certifications.renewed');
  });

  it('logs continuing-education hours, with a photo, and refreshes the hour total', async () => {
    render(<CertificationDetailScreen />);
    fireEvent.changeText(screen.getByTestId('certification-credit-hours'), 'abc');
    fireEvent.press(screen.getByTestId('certification-credit-save'));
    expect(screen.getByTestId('certification-message')).toHaveTextContent('certifications.hoursInvalid');
    expect(store.addCredit).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('certification-credit-hours'), '2,5');
    fireEvent.changeText(screen.getByTestId('certification-credit-category'), 'Course');
    fireEvent.press(screen.getByTestId('certification-credit-camera'));
    await waitFor(() =>
      expect(store.addCredit).toHaveBeenCalledWith({ CertificationId: 5, CreditDate: null, Hours: 2.5, Category: 'Course', Description: null, FileData: 'QUJD', FileName: 'ce-certificate.jpg', FileType: 'image/jpeg' })
    );
    await waitFor(() => expect(store.fetchCertification).toHaveBeenLastCalledWith(5, { bypassCache: true }));
    expect(await screen.findByText('certifications.creditAdded')).toBeTruthy();
  });

  it('removes after confirmation, and keeps the screen with the reason on failure', async () => {
    store.remove.mockImplementationOnce(async () => {
      useCertificationsStore.setState({ actionError: { code: 'forbidden', status: 403, messageKey: 'errors.data.forbidden' } });
      return false;
    });
    render(<CertificationDetailScreen />);
    fireEvent.press(screen.getByTestId('certification-remove'));
    fireEvent.press(screen.getByTestId('certification-remove-confirm-confirm', q));
    await waitFor(() => expect(screen.getByTestId('certification-error')).toHaveTextContent('errors.data.forbidden'));
    expect(router.back).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('certification-remove'));
    fireEvent.press(screen.getByTestId('certification-remove-confirm-confirm', q));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(store.remove).toHaveBeenLastCalledWith(5);
  });

  it('says so for an id that is not a certification', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'x' });
    render(<CertificationDetailScreen />);
    expect(screen.getByTestId('certification-invalid')).toBeTruthy();
  });
});

describe('CertificationEditScreen', () => {
  it('adds a named certification and opens it', async () => {
    useCertificationsStore.setState({ types: [type(3, 'Paramedic')] });
    render(<CertificationEditScreen />);
    expect(store.fetchTypes).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('certification-save'));
    expect(screen.getByTestId('certification-form-message')).toHaveTextContent('certifications.nameRequired');
    expect(store.save).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('certification-name'), 'Swift water rescue');
    fireEvent.changeText(screen.getByTestId('certification-number'), ' SW-7 ');
    fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() =>
      expect(store.save).toHaveBeenCalledWith({
        Id: null,
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

  it('picks a catalog type, which hides the name field', async () => {
    useCertificationsStore.setState({ types: [type(3, 'Paramedic'), type(4, 'Retired', { IsActive: false })] });
    render(<CertificationEditScreen />);
    fireEvent.press(screen.getByTestId('certification-type'));
    expect(screen.queryByTestId('certification-type-sheet-option-4', q)).toBeNull();
    fireEvent.press(screen.getByTestId('certification-type-sheet-option-3', q));
    expect(screen.queryByTestId('certification-name')).toBeNull();
    // The sheet tears its modal down when its close animation ends.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    fireEvent.press(screen.getByTestId('certification-save'));
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ TypeId: 3, Name: null })));
  });

  it('seeds the form from an existing record, and reads one the list does not hold', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '7' });
    useCertificationsStore.setState({ certifications: [cert(7, { Name: 'Hazmat', Number: 'H-1', ExpiresOn: '2027-05-01T00:00:00' })] });
    const { unmount } = render(<CertificationEditScreen />);
    expect(screen.getByTestId('certification-name')).toHaveProp('value', 'Hazmat');
    expect(screen.getByTestId('certification-number')).toHaveProp('value', 'H-1');
    expect(store.fetchCertification).not.toHaveBeenCalled();
    unmount();

    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '8' });
    render(<CertificationEditScreen />);
    await waitFor(() => expect(store.fetchCertification).toHaveBeenCalledWith(8));
    expect(screen.queryByTestId('certification-save')).toBeNull();
  });
});
