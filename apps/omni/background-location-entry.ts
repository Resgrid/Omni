// Side-effect module imported by index.ts between the location task definition and expo-router's entry, so the
// headless background-location bootstrap is registered while the bundle evaluates — before anything can mount.
import { registerEntryBackgroundLocation } from './background-location';

registerEntryBackgroundLocation();
