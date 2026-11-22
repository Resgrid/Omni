/**
 * In-app notification sounds (Unit/IC `notification-sound.service`, modern set only — D17). Used where the OS plays
 * nothing: foreground web/desktop pushes and SignalR-driven desktop notices. Native foreground pushes already play
 * their channel sound through the OS.
 *
 * The package never imports app assets: the app passes the bundled files of its sound set once
 * (`configureNotificationSounds({ modernnotification: require('…/modernnotification.wav'), … })`, from each variant's
 * root layout through apps/omni/sound-sets/<variant>.ts): the Dispatch app passes its own files, desk sounds included.
 */
import { logger } from '@resgrid/core';
import { Asset } from 'expo-asset';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { isAlertSuppressed } from './alert-suppression';
import { getSoundSet } from './configure';
import type { NotificationKind } from './event-codes';
import { type NotificationSound, soundForSet, soundForSoundType } from './sounds';

/** A `require()`d asset module id or a URI, per sound. */
export type NotificationSoundAssets = Partial<Record<NotificationSound, number | string>>;

export interface NotificationSoundRequest {
  kind: NotificationKind | 'unknown';
  /** `NC:` call closed. */
  closed?: boolean;
  /** Core's push `type` (the sound type / channel id), when the push carried one. */
  soundType?: unknown;
}

/** Fallback by meaning when the push named no sound type (modern set only). */
export const KIND_SOUNDS: Readonly<Record<NotificationKind | 'unknown', NotificationSound>> = {
  call: 'moderncallmedium',
  message: 'modernmessage',
  notification: 'modernnotification',
  chat: 'modernchat',
  chatbot: 'modernchat',
  weatherAlert: 'modernweatheralert',
  workOrder: 'modernnotification',
  signInApproval: 'modernnotification',
  communicationTest: 'modernnotification',
  unitStatusTimer: 'modernunitnotice',
  recurringCallAlert: 'modernnotification',
  // Desk pushes always name their sound type (28-32, resolved above); this is only the fallback for a push without one.
  deskItem: 'modernnotification',
  deskBreak: 'modernnotification',
  unknown: 'modernnotification',
};

/** The server's sound type wins (same mapping as the Android channels); otherwise the kind decides. */
export const soundForNotification = (request: NotificationSoundRequest): NotificationSound => {
  const fromType = soundForSoundType(request.soundType);
  if (fromType) return fromType;
  if (request.kind === 'call' && request.closed) return 'moderncallclosed';
  return KIND_SOUNDS[request.kind];
};

class NotificationSoundService {
  private assets: NotificationSoundAssets = {};
  private players = new Map<NotificationSound, AudioPlayer>();
  private loading = new Map<NotificationSound, Promise<AudioPlayer | null>>();
  private audioModePromise: Promise<void> | null = null;

  /** Registers the bundled sound files. Replaces any previous set. */
  configure(assets: NotificationSoundAssets): void {
    this.assets = { ...assets };
  }

  private ensureAudioMode(): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();
    if (!this.audioModePromise) {
      this.audioModePromise = setAudioModeAsync({
        allowsRecording: false,
        shouldPlayInBackground: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldRouteThroughEarpiece: false,
      }).catch((error: unknown) => {
        this.audioModePromise = null;
        logger.warn({ message: 'Notification sounds: audio mode could not be set', context: { error } });
      });
    }
    return this.audioModePromise;
  }

  private async load(sound: NotificationSound): Promise<AudioPlayer | null> {
    const existing = this.players.get(sound);
    if (existing) return existing;
    const pending = this.loading.get(sound);
    if (pending) return pending;

    const source = this.assets[sound];
    if (source === undefined) {
      logger.warn({ message: 'Notification sound not configured', context: { sound } });
      return null;
    }

    const task = (async (): Promise<AudioPlayer | null> => {
      try {
        let uri: string;
        if (typeof source === 'number') {
          const asset = Asset.fromModule(source);
          await asset.downloadAsync();
          uri = asset.localUri ?? asset.uri;
        } else {
          uri = source;
        }
        const player = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
        player.loop = false;
        player.volume = 1.0;
        this.players.set(sound, player);
        return player;
      } catch (error) {
        logger.error({ message: 'Notification sound could not be loaded', context: { sound, error } });
        return null;
      } finally {
        this.loading.delete(sound);
      }
    })();
    this.loading.set(sound, task);
    return task;
  }

  /**
   * Plays one sound from the start. Never throws. A desk sound (`soundForDeskEvent`) plays where the app's sound set has
   * it (Dispatch) and its shared fallback anywhere else.
   */
  async play(sound: NotificationSound): Promise<void> {
    try {
      await this.ensureAudioMode();
      const player = await this.load(soundForSet(sound, getSoundSet()));
      if (!player) return;
      if (player.isLoaded) {
        await player.seekTo(0);
      }
      player.play();
    } catch (error) {
      logger.error({ message: 'Notification sound could not be played', context: { sound, error } });
    }
  }

  /** Plays the sound for a notification (server sound type first, then its meaning). */
  async playForNotification(request: NotificationSoundRequest): Promise<void> {
    // Alerts held back (a dispatcher on break, `alert-suppression.ts`); `play()` itself (the Settings sound test) never is.
    if (isAlertSuppressed({ channel: 'sound', kind: request.kind })) return;
    await this.play(soundForNotification(request));
  }

  /** Releases every player (sign-out, tests). */
  cleanup(): void {
    for (const player of this.players.values()) {
      try {
        player.remove();
      } catch {
        // Already released.
      }
    }
    this.players.clear();
    this.loading.clear();
    this.audioModePromise = null;
  }
}

export const notificationSoundService = new NotificationSoundService();

export function configureNotificationSounds(assets: NotificationSoundAssets): void {
  notificationSoundService.configure(assets);
}
