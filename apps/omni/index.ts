// App entry. Background tasks must be defined before anything else loads so the OS can relaunch a
// killed app straight into them (Responder's fix for dropped background location fixes, omni-plan §7.7).
// @resgrid/location registers its task when imported; it is a no-op for variants without background location.
import '@resgrid/location/background-task';
import 'expo-router/entry';
