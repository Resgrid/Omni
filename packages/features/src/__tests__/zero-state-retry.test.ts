import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// An empty, not-found or error state replaces what failed to load, so pull to refresh goes with it (and web and
// Electron never had it): every `ZeroState` passes `onRetry`, which shows a Retry / Refresh button that loads it again
// without leaving the screen. The only exceptions are states a refetch cannot change, listed by file and test id with
// the reason.
const FEATURES = path.resolve(__dirname, '..');

const NO_REFETCH = {
  'awaiting-resources/screens/awaiting-resources.tsx#awaiting-resources-disabled': 'the department has not turned the feature on',
  'calls/screens/call-detail.tsx#call-detail-invalid': 'the route carries no call id',
  'calls/screens/call-edit.tsx#call-edit-invalid': 'the route carries no call id',
  'calls/screens/call-form.tsx#call-form-edit-not-allowed': 'the person may not edit this call',
  'calls/screens/call-form.tsx#call-form-not-allowed': 'the person may not create calls',
  'certifications/screens/certification-detail.tsx#certification-invalid': 'the route carries no certification id',
  'chat/screens/chat-conversation.tsx#chat-conversation-invalid': 'the route carries no channel id',
  'chat/screens/chatbot.tsx#chatbot-empty': 'a new conversation with the assistant, not a fetched list',
  'checklists/screens/checklists.tsx#checklists-disabled': 'the department has not turned the feature on',
  'dashboard/screens/dashboard.tsx#dashboard-empty': 'the person has added no widgets (kept on the device)',
  'incident-command/screens/call-command.tsx#call-command-invalid': 'the route carries no call id',
  'incident-command/screens/command-board.tsx#command-board-empty': 'no command is being tracked on this device',
  'incident-command/screens/command-board.tsx#command-board-screen': 'the app has no command tier',
  'incident-command/screens/command-log.tsx#command-log-invalid': 'the route carries no call id',
  'incident-command/screens/resource-map.tsx#resource-map-unknown': 'the route carries no position',
  'inventory/screens/inventory-home.tsx#inventory-no-unit': 'no active unit is selected',
  'messages/screens/message-compose.tsx#message-compose-not-allowed': 'the person may not send messages',
  'messages/screens/message-detail.tsx#message-detail-invalid': 'the route carries no message id',
  'navigation/screens/navigation-screen.tsx#navigation-unavailable': 'in-app navigation is off, or the route carries no destination',
  'notifications/screens/notifications-inbox.tsx#notifications-inbox-unavailable': 'the inbox is not configured for this app',
  'operations/screens/operations-deployment.tsx#operations-access-disabled': 'the department has not turned the feature on',
  'operations/screens/operations-deployment.tsx#operations-disabled': 'the department has not turned the feature on',
  'operations/screens/operations-deployment.tsx#operations-invalid': 'the route carries no deployment id',
  'operations/screens/operations-list.tsx#operations-access-disabled': 'the department has not turned the feature on',
  'operations/screens/operations-list.tsx#operations-disabled': 'the department has not turned the feature on',
  'records/screens/record-connector-detail.tsx#connector-forbidden': 'administrators only',
  'records/screens/record-connector-detail.tsx#connector-invalid': 'the route carries no connector id',
  'records/screens/record-connectors.tsx#connectors-forbidden': 'administrators only',
  'records/screens/record-deployment-detail.tsx#deployment-invalid': 'the route carries no deployment id',
  'records/screens/record-detail.tsx#record-detail-invalid': 'the route carries no record id',
  'records/screens/records-home.tsx#records-home-disabled': 'the department has not turned the feature on',
  'shifts/screens/shift-day.tsx#shift-day-invalid': 'the route carries no shift day id',
  'shifts/screens/shift-trade.tsx#shift-trade-invalid': 'the route carries no trade id',
  'unit-status/components/unit-status-panel.tsx#`${testID}-empty`': 'no active unit, or its status set has no buttons (configured by the department)',
  'weather-alerts/screens/weather-alert-settings.tsx#weather-alert-settings-unavailable': 'the person may not change the settings',
  'work-orders/screens/work-order-detail.tsx#work-order-invalid': 'the route carries no work order id',
} satisfies Record<string, string>;

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);

    return entry.name.endsWith('.tsx') ? [full] : [];
  });

const attribute = (element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined =>
  element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);

/** The test id as written: a string literal's text, or the expression's source for a computed id. */
const testIdOf = (element: ts.JsxOpeningLikeElement): string => {
  const initializer = attribute(element, 'testID')?.initializer;

  if (!initializer) return '(no testID)';

  if (ts.isStringLiteral(initializer)) return initializer.text;

  return ts.isJsxExpression(initializer) && initializer.expression ? initializer.expression.getText() : '(no testID)';
};

/** `file#testID` of every `ZeroState` in the file, and whether each passes `onRetry`. */
const zeroStates = (file: string): { key: string; hasRetry: boolean }[] => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relative = path.relative(FEATURES, file).split(path.sep).join('/');
  const found: { key: string; hasRetry: boolean }[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === 'ZeroState') {
      found.push({ key: `${relative}#${testIdOf(node)}`, hasRetry: attribute(node, 'onRetry') !== undefined });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
};

describe('zero states', () => {
  const states = sourceFiles(FEATURES).flatMap(zeroStates);

  it('finds the screens it guards', () => {
    expect(states.length).toBeGreaterThan(100);
  });

  it('offer a Retry / Refresh button that refetches, unless a refetch cannot change the state', () => {
    const missing = states.filter((state) => !state.hasRetry && !(state.key in NO_REFETCH)).map((state) => state.key);

    expect(missing).toEqual([]);
  });

  it('lists only exceptions that still exist and still have no retry', () => {
    const withoutRetry = new Set(states.filter((state) => !state.hasRetry).map((state) => state.key));

    expect(Object.keys(NO_REFETCH).filter((key) => !withoutRetry.has(key))).toEqual([]);
  });
});
