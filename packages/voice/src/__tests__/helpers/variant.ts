import { resetActiveVariantForTests, setActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';

/** Voice capabilities of the five variants (apps/omni/variants/<id>/variant.json). */
export const VOICE_BY_VARIANT: Record<VariantId, { voice: VariantManifest['capabilities']['voice']; iosBackgroundModes: string[] }> = {
  responder: { voice: { ptt: true, callKeep: true, bluetoothPtt: true, headsetButtonPtt: true, desktopPtt: false }, iosBackgroundModes: ['remote-notification', 'audio', 'bluetooth-central', 'voip', 'location'] },
  unit: { voice: { ptt: true, callKeep: true, bluetoothPtt: true, headsetButtonPtt: true, desktopPtt: false }, iosBackgroundModes: ['remote-notification', 'audio', 'bluetooth-central', 'voip', 'location'] },
  ic: { voice: { ptt: true, callKeep: true, bluetoothPtt: true, headsetButtonPtt: false, desktopPtt: false }, iosBackgroundModes: ['remote-notification', 'audio', 'bluetooth-central', 'voip'] },
  dispatch: { voice: { ptt: true, callKeep: false, bluetoothPtt: true, headsetButtonPtt: false, desktopPtt: true }, iosBackgroundModes: ['remote-notification', 'audio', 'bluetooth-central', 'voip'] },
  bigboard: { voice: { ptt: false, callKeep: false, bluetoothPtt: false, headsetButtonPtt: false, desktopPtt: false }, iosBackgroundModes: ['remote-notification'] },
};

/** Activates a minimal manifest carrying only what voice reads (capabilities.voice, native.iosBackgroundModes). */
export const activateVariant = (id: VariantId): void => {
  resetActiveVariantForTests();
  const { voice, iosBackgroundModes } = VOICE_BY_VARIANT[id];
  setActiveVariant({ id, capabilities: { voice }, native: { iosBackgroundModes } } as unknown as VariantManifest);
};
