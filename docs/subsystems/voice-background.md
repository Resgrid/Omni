# Voice and audio streams in the background

Responder, Unit, IC and Dispatch keep a department audio (scanner) stream and a push-to-talk voice channel working with the app in the background or the screen off, on iOS and Android. BigBoard has neither (`capabilities.voice.ptt: false`). Web and Electron need nothing: a browser tab keeps playing audio, and Dispatch's desktop console talks through its hotkey. Everything lives in `@resgrid/voice`; `@resgrid/app-shell` injects what it needs at startup (`init/default-steps.ts`, `init/voice-session.ts`).

## Audio streams

- **Background playback and OS controls.** A stream plays with expo-audio and is published to the OS media session (`setActiveForLockScreen`): the lock screen and Control Center on iOS, the media notification on Android (expo-audio's `AudioControlsService`, a `mediaPlayback` foreground service). Its pause and play buttons act on the player; the stream otherwise plays until the member picks None in the sheet. Without that visible control Play rejects the app and Android kills the playback after about three minutes.
- **iOS audio mode.** iOS gives those controls only to an app whose session does not mix with other apps, so a stream takes the audio (`doNotMix`, IC's fix). While a PTT channel is joined the stream mixes like the call's own session, and it gets its own mode back when the call ends (`streamAudioMode`, `releaseRecordingSession`).
- **Reconnect.** A drop is an error, a live stream that "ends" (the relay closed the connection), buffering for 20 s, or the device moving between Wi-Fi and cellular. The same player then loads the stream again at its live edge (`replace`), so the OS controls and the Android service stay up and the app is not suspended or killed meanwhile. Attempts back off (1, 2, 4, 8, 15, then every 30 s) for about ten minutes; while the device is offline no attempt is spent, and the next one runs as soon as the network is back. The sheet says "Reconnecting to …" and another stream can still be picked.
- **Resuming a live stream.** Resumed from the OS controls after more than 10 s, the stream reconnects at its live edge instead of playing a buffer that is minutes old (or a dead socket). The sheet shows a paused stream as Paused.

## Push-to-talk

- **Keeping the call alive.** Joining a channel starts a CallKeep call (CallKit on iOS, a self-managed ConnectionService on Android) and, on Android, a silent `microphone` foreground service (notifee, channel `voice_session`). iOS keeps an app with an active call running, and Android allows microphone capture from the background only under that service. Remote audio keeps playing; Dispatch and IC now do this as Responder and Unit do.
- **Talking with the screen off.** A BLE PTT handset (Aina, Inrico, HYS) toggles or holds the microphone in every app with voice (`bluetoothPtt`), and so does an earbud or headset button (`headsetButtonPtt`; Settings → Voice → "Talk with the earbud button", on by default) — see the next section.
- **Reconnect.** LiveKit itself resumes a room through short drops (about 45 s of retries). If it gives up, the store rejoins the channel the member never left, with a fresh token and muted, backing off like the streams and going at once when the network comes back or changes. The CallKit call, the Android service, headset monitoring and the audio session stay up meanwhile: without them iOS would suspend the app and Android would not let a microphone service start again from the background. A drop the server meant (removed from the room, the room closed, the same identity joined elsewhere) is not rejoined. Disconnect, or ending the call from the system UI, stops it. The sheet shows the channel with "Reconnecting…" and Disconnect.
- **China.** The App Store rejects apps that use CallKit where the device region is China (guideline 5). There, iOS runs without CallKeep (the headset button falls back to remote commands); Android is not affected.

## Earbuds and headsets

While a channel is joined the app holds a system call (CallKeep), and during a call iOS and Android own the earbud button. What each kind sends, and what the app does with it:

| Earbuds                                                                                          | iOS (CallKit)                                                                                  | Android (self-managed call)                                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AirPods Pro, AirPods 3 and 4, AirPods Max (iOS 17+, "Mute & Unmute" on its default single press) | A press is CallKit's mute action: talk toggles. A double press ends the call: talk toggles too | —                                                                                    |
| Other Bluetooth earbuds and headsets with a call button                                          | The press ends the call: talk toggles                                                          | The press hangs up through Telecom: talk toggles                                     |
| Wired earbuds with a button                                                                      | The press ends the call: talk toggles                                                          | A short press hangs up (talk toggles); a long press is Telecom's mute (talk toggles) |
| AirPods 1st / 2nd generation                                                                     | A press ends the call: talk toggles                                                            | —                                                                                    |

A press that arrives as "end call" toggles talk because the member is still in the channel: the channel stays, the app starts the system call again (iOS needs it to use the microphone in the background) and opens or closes the microphone, with the transmit chimes. Pressed while talking, the microphone closes at once. The channel is still left when:

- another phone call is ringing or in progress once the press settles (400 ms) — a cellular call answered with "End & Accept", or an emergency call, which Android places by ending self-managed calls (iOS: CallKit's call list; Android: the device's audio mode, `InCallAudioModule.isInPhoneCall`). Talk never opens over another call;
- the member turned off Settings → Voice → "Talk with the earbud button" (saved per device under `headsetButtonPttEnabled`, kept across sign-outs; the Bluetooth store's `mediaButtonPTTSettings.enabled`), or the variant has no `headsetButtonPtt`;
- the system call cannot be started again.

Neither platform tells an earbud's "end call" from the End button of the system call screen, so **End on the lock screen or in the call banner also toggles talk**; the member leaves the channel from the app (Disconnect in the voice sheet). Without a system call (iOS in China) the earbud button reaches the app as a play/pause command instead (`MediaButtonModule`, toggle or hold per `pttMode`).

## Permissions (Android)

CallKeep's `VoiceConnectionService` is a `phoneCall` foreground service and self-managed calls need `MANAGE_OWN_CALLS`, so every app with CallKeep declares `FOREGROUND_SERVICE_PHONE_CALL`, `READ_PHONE_STATE`, `READ_PHONE_NUMBERS` and `MANAGE_OWN_CALLS` (Responder and Dispatch lacked them; on Android 14 the call's service failed silently). `FOREGROUND_SERVICE_MICROPHONE` covers the voice service and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` the stream's. All four declare the `audio`, `voip` and `bluetooth-central` iOS background modes.

## Not verified yet (needs devices)

- A stream keeps playing for more than three minutes in the background, its lock-screen and notification controls pause and resume it, and it reconnects across a Wi-Fi ↔ cellular switch (iOS and Android).
- Room audio is heard with the screen locked; a BLE handset press unmutes from the background — also while a stream plays.
- Each row of the earbuds table on a locked phone: AirPods Pro / 3 / 4 single and double press, a Bluetooth headset, wired earbuds (short and long press on Android); talk starts within about a second of the press, and how the call coming back sounds and looks (a call-ended tone, the call notification redrawn) is acceptable.
- A cellular call answered with "End & Accept" on iOS, and a call to an emergency number on Android, while a channel is joined: the channel is left and the microphone never opens.
- A channel rejoins after the network is gone for longer than LiveKit's own retries, in the background, without a second CallKit call or service notification.
- Dispatch on iOS and Android with its new CallKeep call; the China fallback on an iOS device set to that region.
