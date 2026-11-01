/** react-native-logs stand-in: @resgrid/core's logger has no console transport under Jest. */
export const consoleTransport = (): void => undefined;

export const logger = {
  createLogger: (): Record<string, () => void> => ({}),
};
