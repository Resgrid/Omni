# Notification sound scripts

Plain Node, no dependencies, deterministic (the same script always writes the same bytes). Run from the repo root.

| Script                         | What it does                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `generate-call-sounds.mjs`     | The shared call alert sounds in `apps/omni/assets/audio` (four priorities and re-notify, four plays each, -6 / -3 LUFS).            |
| `generate-dispatch-sounds.mjs` | The Dispatch app's own sound set in `apps/omni/variants/dispatch/assets/audio` (every modern sound plus the five desk sounds).      |
| `fix-peaks.mjs <file.wav>`     | Repairs a sound that clips, in place, without otherwise changing it.                                                                |
| `audio.mjs`                    | Shared helpers: 16-bit PCM WAV in/out, BS.1770 momentary loudness, 4x oversampled true peak, de-clipper, look-ahead limiter, fades. |

## The Dispatch sound set

The Dispatch app (variant manifest `capabilities.push.soundSet: "dispatch"`) ships its own notification sounds so a
dispatcher can tell at once that a sound came from the Dispatch app and not from Responder or Unit on the same desk.
Every file has the name of the shared sound it replaces, so Core's push sound types, the Android channel ids and the iOS
sound names stay 1:1 and no server change is needed. The five dispatcher desk sounds (Core `PushSoundTypes` 28–32) exist
only in this set. Department custom call tones (`c1`–`c25`) stay shared.

```
node scripts/notification-sounds/generate-dispatch-sounds.mjs
```

The set keeps the modern style (short tonal chimes, fast attack, bell-like decay) and each shared sound's loudness
(loudest 400 ms, EBU R128 momentary) and length class, with its own identity:

- **Timbre: the console mallet.** A soft FM voice (carrier with a 1:1 modulator whose index falls away after the strike),
  the bar partial two octaves up and a faint tine, like a vibraphone bar, with a slow motor tremolo on ringing notes. The
  shared set is pure sine chimes and bright two-tone beeps, and nothing in it trembles. Alarms use the bright variant: a
  2:1 modulator (odd harmonics that carry over a noisy room) and a faster tremolo. Everything is low-passed at 6.5 kHz.
- **Signature: the console tap.** Every sound opens with a short grace note a perfect fifth below the note it leads into.
- **Key: D major pentatonic** (D E F# A B) for every note, so the set sounds like one instrument.
- **Urgency stays ordered.** Re-notify > emergency > high > medium > low by tempo, density, register and brightness
  (the four priority tones at -6 LUFS like the shared set, re-notify -3 LUFS and louder while sounding); call updated and
  closed, statuses and breaks use the soft voice and slower figures.

| Sound                     | Figure                                                                    | Voice  | Level     |
| ------------------------- | ------------------------------------------------------------------------- | ------ | --------- |
| `moderncallemergency`     | tap into D6, eight fast A6/D6 strikes, a held trembling D-F#-A chord; ×4  | bright | -6 LUFS   |
| `moderncallhigh`          | tap into D6, three rising D-F#-A arpeggios; ×4                            | bright | -6 LUFS   |
| `moderncallmedium`        | tap into A5, two A-F#-A turns; ×4                                         | mallet | -6.3 LUFS |
| `moderncalllow`           | tap into A5, a slow ringing D6+A5 dyad; ×4                                | mallet | -6 LUFS   |
| `moderncallrenotify`      | four rapid A5-D6-F#6 bursts, a fast-pulsing D6+A6 accent; ×4              | bright | -3 LUFS   |
| `moderncallupdated`       | tap into A6, answered by E6                                               | mallet | -15.8     |
| `moderncallclosed`        | tap into A5, falling through F#5 to D5                                    | soft   | -19.4     |
| `modernchat`              | the tap alone (D6 into A6), short                                         | soft   | -29.4     |
| `modernmessage`           | tap into A6, rung twice                                                   | mallet | -20.4     |
| `modernnotification`      | tap into E6, one clear strike                                             | mallet | -13.5     |
| `modernpersonnelstatus`   | tap into F#6                                                              | soft   | -31.1     |
| `modernunitstatus`        | tap into B5, rung twice                                                   | mallet | -14.4     |
| `modernstaffing`          | tap into E6, falling to D6                                                | mallet | -14.9     |
| `modernunitnotice`        | tap into E5                                                               | soft   | -21.1     |
| `moderncalendar`          | tap into F#6, falling to D6                                               | soft   | -23.4     |
| `modernavailabilityalert` | tap into A6, a quick second A6                                            | mallet | -17.1     |
| `modernresourceorder`     | tap into A5, B5, back to A5                                               | mallet | -15.9     |
| `modernweatheralert`      | tap into A6, walking down F#6, D6 to a ringing A5                         | bright | -12.3     |
| `modernshift`             | tap into A5, a rising D-F#-A arpeggio that rings out                      | mallet | -8.4      |
| `moderntraining`          | tap into E6, a slow descent D6-A5-F#5-D5 that rings out                   | soft   | -16.8     |
| `moderntroublealert`      | tap into B6, ten fast F#6/B6 strikes, a held trembling B5+F#6             | bright | -5.5      |
| `moderndeskoffer`         | desk offer (28): tap into A6, rising B6, D7 ("for you")                   | mallet | -11       |
| `moderndeskqueuealert`    | desk queue alert (29): two tapped double E6 strikes, the second trembling | bright | -8        |
| `moderndeskmessage`       | desk message (30): tap into B6, answered by D7                            | mallet | -18.5     |
| `modernbreakreminder`     | break reminder (31): tap into A6, a relaxed descent F#6, D6               | soft   | -16       |
| `modernbreakover`         | break over (32): tap into A5, a rising D6-F#6-A6 "back on"                | mallet | -13       |

Every file is mono 44.1 kHz 16-bit PCM WAV, true peak at or below -1 dBTP, with click-free fades, and shorter than the
iOS 30 s limit. `packages/notifications/src/__tests__/sound-files.test.ts` checks the set (every stem present, format,
peaks, fades, four identical plays for the call alerts, re-notify above the priority tones, each file's loudness within
3.5 dB of the shared sound it replaces). To change a sound, edit its entry in `SOUNDS` in the generator, run it, listen,
and run that test.

Where the files go: `withNotificationSounds` (packages/config-plugins) copies the set named by the manifest into the
native projects (Android `res/raw`, the iOS bundle, plus the desk sounds under Core's `28.wav`–`32.wav` fallback names on
iOS); `apps/omni/sound-sets/dispatch.ts` (web, Electron) and `dispatch.native.ts` hand them to the in-app player. Android
channel ids do not change: notifee stores a channel's sound as `android.resource://<package>/raw/<name>`, resolved when
it plays, so the Dispatch app's existing channels play the new files after the update, and only the desk channels are new.
