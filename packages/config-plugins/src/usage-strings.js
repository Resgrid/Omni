// iOS purpose strings / Android rationale text, parameterized by app name. Carried from the legacy
// app.config.ts files; App Store review (ITMS-90683) requires a string for every framework a linked
// module references, so each one is emitted only for variants that link that module.

const usage = {
  bluetooth: (n) =>
    `${n} uses Bluetooth to connect to wireless headsets and speaker-microphone accessories for Push-to-Talk audio. For example, when you pair a Bluetooth speaker-mic, pressing its talk button transmits your voice to your department audio channel.`,
  faceId: (n) =>
    `${n} uses Face ID to unlock the securely stored credentials that keep you signed in to your department. For example, after your device locks, Face ID confirms it is you before the app restores your session.`,
  locationWhenInUse: (n) =>
    `${n} uses your location while you use the app to show your position on the department map and to attach your coordinates when you set a status or respond to a call. For example, when you respond to a call, your location is shared with dispatch so they can see who is closest to the scene.`,
  locationAlways: (n) =>
    `${n} uses your location, including in the background, to keep your department's dispatch map updated with your position. For example, while you are en route to an emergency call, your location is periodically sent to dispatchers so they can track your arrival and coordinate resources, even when the app is not on screen.`,
  motion: (n) =>
    `${n} uses motion data to improve the accuracy of your location on the department map. For example, while you are driving to a call, motion data helps distinguish travel from a stop so dispatchers see an accurate position and heading.`,
  photos: (n) =>
    `${n} uses your photo library so you can attach existing photos to calls and chat messages. For example, you can select a saved photo of an incident scene and share it with dispatch and other responders on the call.`,
  camera: (n) =>
    `${n} uses the camera to take photos that you attach to calls and for video during department video sessions. For example, you can photograph an incident scene and attach the image to the active call for other responders to see.`,
  microphone: (n) =>
    `${n} uses the microphone to capture your voice for Push-to-Talk and voice calls with your department. For example, when you press and hold the talk button, your voice is transmitted live to other responders on the channel.`,
  calendars: (n) => `${n} uses your calendar to add department events and shifts you sign up for. For example, after you sign up for a shift, it can be added to your device calendar so you get a reminder.`,
};

module.exports = { usage };
