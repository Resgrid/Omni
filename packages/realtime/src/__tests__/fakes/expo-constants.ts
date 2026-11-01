/** expo-constants stand-in: no `extra.env`, so @resgrid/core's Env falls back to its defaults (eventingHub, geolocationHub, chatHub). */
const Constants = { expoConfig: { extra: {} as Record<string, unknown>, version: '0.0.0' } };

export default Constants;
