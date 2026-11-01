const notifee = {
  displayNotification: jest.fn(async () => 'notification-id'),
  stopForegroundService: jest.fn(async () => undefined),
};

export default notifee;
