const notifee = {
  createChannel: jest.fn(async (channel: { id: string }) => channel.id),
  displayNotification: jest.fn(async () => 'notification-id'),
  registerForegroundService: jest.fn(),
  stopForegroundService: jest.fn(async () => undefined),
};

export default notifee;
