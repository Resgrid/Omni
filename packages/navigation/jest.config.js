// Engine (pure TS), session store and navigation components: the shared React Native preset (jest-expo, iOS platform).
module.exports = { ...require('../../tooling/jest-preset/react-native'), displayName: 'navigation', rootDir: __dirname, testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures'] };
