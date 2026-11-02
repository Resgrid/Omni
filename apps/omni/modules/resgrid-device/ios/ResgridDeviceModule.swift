import AVFoundation
import ExpoModulesCore

/// Device helpers expo-file-system and expo-speech do not offer (Resgrid Omni):
/// - backup exclusion: downloaded offline map packs are re-downloadable caches and must not go to iCloud
///   (`NSURLIsExcludedFromBackupKey`, MapLibre plan §19.5 / §19.11);
/// - ducking: lower other apps' audio while a turn-by-turn prompt is spoken (plan §9.2), and give the session back
///   afterwards. A call or push-to-talk session (`playAndRecord`, LiveKit / CallKeep) is never touched.
public class ResgridDeviceModule: Module {
  private var duckingActive = false
  private var savedCategory: AVAudioSession.Category?
  private var savedMode: AVAudioSession.Mode?
  private var savedOptions: AVAudioSession.CategoryOptions = []

  public func definition() -> ModuleDefinition {
    Name("ResgridDevice")

    AsyncFunction("excludeFromBackupAsync") { (uri: String) -> Bool in
      guard var url = URL(string: uri), url.isFileURL else {
        return false
      }
      if !FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
      return true
    }

    AsyncFunction("isExcludedFromBackupAsync") { (uri: String) -> Bool in
      guard let url = URL(string: uri), url.isFileURL else {
        return false
      }
      let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
      return values.isExcludedFromBackup ?? false
    }

    AsyncFunction("beginSpeechDuckingAsync") { () -> Bool in
      let session = AVAudioSession.sharedInstance()
      if self.duckingActive {
        return true
      }
      // In a call or a push-to-talk channel the session belongs to the voice stack.
      if session.category == .playAndRecord || session.category == .record {
        return false
      }
      self.savedCategory = session.category
      self.savedMode = session.mode
      self.savedOptions = session.categoryOptions
      try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
      try session.setActive(true)
      self.duckingActive = true
      return true
    }

    AsyncFunction("endSpeechDuckingAsync") { () -> Bool in
      guard self.duckingActive else {
        return false
      }
      self.duckingActive = false
      let session = AVAudioSession.sharedInstance()
      // Deactivating tells the other apps to restore their volume.
      try? session.setActive(false, options: [.notifyOthersOnDeactivation])
      if let category = self.savedCategory {
        try? session.setCategory(category, mode: self.savedMode ?? .default, options: self.savedOptions)
      }
      self.savedCategory = nil
      self.savedMode = nil
      self.savedOptions = []
      return true
    }
  }
}
