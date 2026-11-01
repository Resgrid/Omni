// Module fakes shared by both voice Jest projects. Every native module the package wraps is replaced
// by an in-memory fake under src/__tests__/fakes so tests can drive events (room disconnects, CallKit
// mute actions, BLE notifications, media buttons) without a device.
const path = require('path');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  '^@resgrid/core$': fake('resgrid-core'),
  '^livekit-client$': fake('livekit-client'),
  '^@livekit/react-native$': fake('livekit-react-native'),
  '^@livekit/react-native-webrtc$': fake('livekit-react-native-webrtc'),
  '^react-native-callkeep$': fake('react-native-callkeep'),
  '^react-native-ble-manager$': fake('react-native-ble-manager'),
  '^expo-audio$': fake('expo-audio'),
  '^expo-device$': fake('expo-device'),
  '^@notifee/react-native$': fake('notifee'),
};
