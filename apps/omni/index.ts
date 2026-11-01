// App entry. Background tasks must be defined before anything else loads so the OS can relaunch a
// killed app straight into them (Responder's fix for dropped background location fixes, omni-plan §7.7).
// @resgrid/location defines its task when imported; it is a no-op for variants without background location.
import '@resgrid/location/background-task';
// Then the headless bootstrap that brings storage, the session and the transmitter up when a location batch arrives
// before any route rendered (registered only where the app config sets extra.location.background, on iOS/Android).
import './background-location-entry';
import 'expo-router/entry';
