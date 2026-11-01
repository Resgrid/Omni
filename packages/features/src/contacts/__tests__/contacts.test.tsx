import '../../status/__tests__/test-setup';

import { ProtectedFieldIds } from '@resgrid/auth';
import { useContactsStore } from '@resgrid/data';
import { type ContactResultData, ContactType } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking } from 'react-native';

import { ContactField } from '../components/contact-field';
import { contactActionUrl, contactDisplayName, htmlToText, parseCoordinates } from '../lib/contact-format';
import { defaultNavigationUrl, NavigationHandoffProvider } from '../navigation-handoff';
import ContactDetailScreen from '../screens/contact-detail';
import ContactsListScreen from '../screens/contacts-list';

const contact = (ContactId: string, extra: Partial<ContactResultData> = {}): ContactResultData => ({
  ContactId,
  ContactType: ContactType.Person,
  IsDeleted: false,
  AddedOnUtc: '',
  FirstName: 'Pat',
  LastName: ContactId,
  ...extra,
});

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

beforeEach(() => {
  openURL.mockClear();
  (router.push as jest.Mock).mockClear();
  useContactsStore.setState({
    contacts: [],
    categories: [],
    detailsById: {},
    fetchContacts: jest.fn(async () => undefined),
    fetchCategories: jest.fn(async () => undefined),
    fetchContactDetails: jest.fn(async () => undefined),
    fetchContactNotes: jest.fn(async () => undefined),
    fetchFiles: jest.fn(async () => undefined),
    fetchPreplan: jest.fn(async () => undefined),
  });
});

describe('contact format', () => {
  it('builds only safe action URLs', () => {
    expect(contactActionUrl('phone', '(555) 123-4567')).toBe('tel:5551234567');
    expect(contactActionUrl('email', 'a@b.org')).toBe('mailto:a@b.org');
    expect(contactActionUrl('website', 'resgrid.com')).toBe('https://resgrid.com');
    expect(contactActionUrl('website', 'javascript:alert(1)')).toBeNull();
    expect(parseCoordinates('39.5, -104.9')).toEqual({ latitude: 39.5, longitude: -104.9 });
    expect(parseCoordinates('200,0')).toBeNull();
    expect(htmlToText('<p>Gate <b>1</b></p><script>x()</script>')).toBe('Gate 1');
  });

  it('never builds a name out of withheld parts', () => {
    expect(contactDisplayName(contact('1', { FirstName: 'REDACTED', LastName: 'REDACTED' }))).toBe('REDACTED');
    expect(contactDisplayName(contact('1', { ContactType: ContactType.Company, CompanyName: 'Acme' }))).toBe('Acme');
  });

  it('hands coordinates to the platform default navigation app', () => {
    expect(defaultNavigationUrl({ latitude: 1, longitude: 2 }, 'android')).toBe('google.navigation:q=1,2');
    expect(defaultNavigationUrl({ address: '1 Main St' }, 'web')).toBe('https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St');
  });
});

describe('ContactField', () => {
  it('dials a phone number on tap', async () => {
    render(<ContactField label="Cell" value="555-0100" action="phone" testID="cell" />);
    fireEvent.press(screen.getByTestId('cell'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('tel:5550100'));
  });

  it('shows a withheld value as protected and never dials it', () => {
    render(<ContactField label="Cell" value="REDACTED" action="phone" fieldId={ProtectedFieldIds.contactCellPhone} redactedFields={[ProtectedFieldIds.contactCellPhone]} testID="cell" />);
    expect(screen.queryByText('REDACTED')).toBeNull();
    expect(screen.getByTestId('cell-protected')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cell'));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('hands coordinates to the navigation hand-off', async () => {
    const navigateTo = jest.fn(async () => true);
    render(
      <NavigationHandoffProvider value={{ navigateTo }}>
        <ContactField label="Entrance" value="39.1,-104.2" action="coordinates" testID="entrance" />
      </NavigationHandoffProvider>
    );
    fireEvent.press(screen.getByTestId('entrance'));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.1, longitude: -104.2, label: 'Entrance' }));
  });
});

describe('ContactsListScreen', () => {
  it('searches, filters by category and opens the detail route', () => {
    useContactsStore.setState({
      contacts: [contact('a', { FirstName: 'Alex', ContactCategoryId: 'c1' }), contact('b', { FirstName: 'Blair', ContactCategoryId: 'c2', IsImportant: true }), contact('c', { FirstName: 'Gone', IsDeleted: true })],
      categories: [{ ContactCategoryId: 'c1', Name: 'Vendors' } as never, { ContactCategoryId: 'c2', Name: 'Hospitals' } as never],
    });
    render(<ContactsListScreen />);

    expect(screen.queryByTestId('contact-card-c')).toBeNull();
    fireEvent.press(screen.getByTestId('contacts-category-c1'));
    expect(screen.queryByTestId('contact-card-b')).toBeNull();
    fireEvent.press(screen.getByTestId('contacts-category-all'));
    fireEvent.changeText(screen.getByTestId('contacts-search'), 'blair');
    expect(screen.queryByTestId('contact-card-a')).toBeNull();
    fireEvent.press(screen.getByTestId('contact-card-b'));
    expect(router.push).toHaveBeenCalledWith('/contacts/b');
  });
});

describe('ContactDetailScreen', () => {
  it('rejects an unsafe route id', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ id: '../settings' });
    render(<ContactDetailScreen />);
    expect(screen.getByTestId('contact-detail-missing')).toBeTruthy();
    expect(useContactsStore.getState().fetchContactDetails).not.toHaveBeenCalled();
  });

  it('shows protected values as labels and switches to the pre-plan tab', () => {
    useContactsStore.setState({
      detailsById: { a: contact('a', { Email: 'REDACTED', CellPhoneNumber: '555-0100', RedactedFields: [ProtectedFieldIds.contactEmail] }) },
      preplansByContact: { a: null },
    });
    render(<ContactDetailScreen contactId="a" />);

    expect(screen.queryByText('REDACTED')).toBeNull();
    expect(screen.getByTestId('contact-field-email-protected')).toBeTruthy();
    expect(screen.getByText('555-0100')).toBeTruthy();
    fireEvent.press(screen.getByTestId('contact-tab-preplan'));
    expect(screen.getByText('contacts.preplan.none')).toBeTruthy();
  });
});
