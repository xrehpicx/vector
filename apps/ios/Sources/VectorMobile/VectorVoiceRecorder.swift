import AVFoundation
import Combine
import Foundation

public struct VectorVoiceMemoDraft: Equatable, Identifiable, Sendable {
  public let id: UUID
  public let data: Data
  public let duration: Double
  public let waveform: [Double]
  public let name: String
  public let contentType: String

  public init(
    id: UUID = UUID(),
    data: Data,
    duration: Double,
    waveform: [Double],
    name: String,
    contentType: String = "audio/mp4"
  ) {
    self.id = id
    self.data = data
    self.duration = duration
    self.waveform = waveform
    self.name = name
    self.contentType = contentType
  }

  public var attachment: VectorDraftAttachment {
    VectorDraftAttachment(
      id: id,
      data: data,
      kind: "audio",
      name: name,
      contentType: contentType,
      duration: duration
    )
  }
}

public enum VectorVoiceRecorderPhase: Equatable {
  case idle
  case recording
  case locked
  case preview(VectorVoiceMemoDraft)
}

public enum VectorVoiceGestureDecision: Equatable {
  case send
  case cancel
  case lock

  public static func resolve(
    horizontalTranslation: Double,
    verticalTranslation: Double,
    cancelThreshold: Double = 92,
    lockThreshold: Double = 72
  ) -> VectorVoiceGestureDecision {
    if horizontalTranslation <= -cancelThreshold {
      return .cancel
    }
    if verticalTranslation <= -lockThreshold {
      return .lock
    }
    return .send
  }
}

public enum VectorVoiceRecorderError: LocalizedError, Equatable {
  case permissionDenied
  case unavailable
  case couldNotStart
  case tooShort
  case couldNotRead

  public var errorDescription: String? {
    switch self {
    case .permissionDenied:
      "Microphone access is off. Enable it in Settings to record a voice message."
    case .unavailable:
      "Voice recording isn’t available on this device."
    case .couldNotStart:
      "The voice message couldn’t start. Try again."
    case .tooShort:
      "Hold a little longer to record a voice message."
    case .couldNotRead:
      "The voice message couldn’t be prepared. Try again."
    }
  }
}

@MainActor
public final class VectorVoiceRecorder: NSObject, ObservableObject {
  @Published public private(set) var phase: VectorVoiceRecorderPhase = .idle
  @Published public private(set) var elapsed: TimeInterval = 0
  @Published public private(set) var waveform: [Double] = []
  @Published public private(set) var errorMessage: String?

  public var isRecording: Bool {
    phase == .recording || phase == .locked
  }

  private var audioRecorder: AVAudioRecorder?
  private var meterTimer: Timer?
  private var recordingURL: URL?
  private var startedAt: Date?

  public func start() async -> Bool {
    guard phase == .idle else { return false }
    errorMessage = nil
    guard await requestPermission() else {
      errorMessage = VectorVoiceRecorderError.permissionDenied.localizedDescription
      return false
    }

    do {
      #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
          .playAndRecord,
          mode: .spokenAudio,
          options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        try session.setActive(true, options: .notifyOthersOnDeactivation)
      #endif

      let directory = FileManager.default.temporaryDirectory
        .appending(path: "VectorVoiceMessages", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true
      )
      let url = directory.appending(
        path: "voice-\(UUID().uuidString.lowercased()).m4a"
      )
      let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 64_000,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      ]
      let recorder = try AVAudioRecorder(url: url, settings: settings)
      recorder.isMeteringEnabled = true
      guard recorder.prepareToRecord(), recorder.record() else {
        throw VectorVoiceRecorderError.couldNotStart
      }
      audioRecorder = recorder
      recordingURL = url
      startedAt = Date()
      elapsed = 0
      waveform = []
      phase = .recording
      beginMetering()
      return true
    } catch {
      cleanupRecording(deleteFile: true)
      errorMessage = (error as? LocalizedError)?.errorDescription
        ?? VectorVoiceRecorderError.couldNotStart.localizedDescription
      return false
    }
  }

  public func lock() {
    guard phase == .recording else { return }
    phase = .locked
  }

  @discardableResult
  public func stopForPreview(minimumDuration: TimeInterval = 0.35) -> VectorVoiceMemoDraft? {
    guard isRecording, let url = recordingURL else { return nil }
    sampleMeter()
    audioRecorder?.stop()
    meterTimer?.invalidate()
    meterTimer = nil

    let duration = max(audioRecorder?.currentTime ?? 0, elapsed)
    audioRecorder = nil
    recordingURL = nil
    startedAt = nil
    deactivateAudioSession()

    guard duration >= minimumDuration else {
      try? FileManager.default.removeItem(at: url)
      elapsed = 0
      waveform = []
      phase = .idle
      errorMessage = VectorVoiceRecorderError.tooShort.localizedDescription
      return nil
    }

    do {
      let data = try Data(contentsOf: url)
      try? FileManager.default.removeItem(at: url)
      let draft = VectorVoiceMemoDraft(
        data: data,
        duration: duration,
        waveform: waveform.isEmpty ? Array(repeating: 0.18, count: 24) : waveform,
        name: "Voice message \(Self.fileTimestamp.string(from: Date())).m4a"
      )
      elapsed = duration
      phase = .preview(draft)
      return draft
    } catch {
      try? FileManager.default.removeItem(at: url)
      elapsed = 0
      waveform = []
      phase = .idle
      errorMessage = VectorVoiceRecorderError.couldNotRead.localizedDescription
      return nil
    }
  }

  public func discard() {
    cleanupRecording(deleteFile: true)
    elapsed = 0
    waveform = []
    errorMessage = nil
    phase = .idle
  }

  public func clearPreview() {
    guard case .preview = phase else { return }
    elapsed = 0
    waveform = []
    errorMessage = nil
    phase = .idle
  }

  public func clearError() {
    errorMessage = nil
  }

  public static func normalizedLevel(decibels: Float) -> Double {
    let floor: Float = -52
    guard decibels > floor else { return 0.08 }
    let normalized = (decibels - floor) / -floor
    return min(max(Double(pow(normalized, 1.6)), 0.08), 1)
  }

  private func requestPermission() async -> Bool {
    #if os(iOS)
      return await withCheckedContinuation { continuation in
        AVAudioApplication.requestRecordPermission { granted in
          continuation.resume(returning: granted)
        }
      }
    #else
      return true
    #endif
  }

  private func beginMetering() {
    meterTimer?.invalidate()
    meterTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) {
      [weak self] _ in
      Task { @MainActor [weak self] in
        self?.sampleMeter()
      }
    }
  }

  private func sampleMeter() {
    guard let audioRecorder, isRecording else { return }
    audioRecorder.updateMeters()
    elapsed = startedAt.map { Date().timeIntervalSince($0) } ?? audioRecorder.currentTime
    waveform.append(Self.normalizedLevel(decibels: audioRecorder.averagePower(forChannel: 0)))
    if waveform.count > 42 {
      waveform.removeFirst(waveform.count - 42)
    }
  }

  private func cleanupRecording(deleteFile: Bool) {
    meterTimer?.invalidate()
    meterTimer = nil
    audioRecorder?.stop()
    audioRecorder = nil
    if deleteFile, let recordingURL {
      try? FileManager.default.removeItem(at: recordingURL)
    }
    recordingURL = nil
    startedAt = nil
    deactivateAudioSession()
  }

  private func deactivateAudioSession() {
    #if os(iOS)
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
    #endif
  }

  private static let fileTimestamp: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd HH.mm.ss"
    return formatter
  }()
}

@MainActor
public final class VectorAudioPlaybackController: NSObject, ObservableObject, @preconcurrency AVAudioPlayerDelegate {
  @Published public private(set) var isPlaying = false
  @Published public private(set) var progress: Double = 0
  @Published public private(set) var duration: TimeInterval = 0
  @Published public private(set) var errorMessage: String?

  private var player: AVAudioPlayer?
  private var timer: Timer?

  public func load(data: Data) {
    stop()
    do {
      let player = try AVAudioPlayer(data: data)
      player.delegate = self
      player.prepareToPlay()
      self.player = player
      duration = player.duration
      progress = 0
      errorMessage = nil
    } catch {
      errorMessage = "This voice message can’t be played."
    }
  }

  public func load(url: URL) async {
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      guard let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
      else {
        throw URLError(.badServerResponse)
      }
      load(data: data)
    } catch {
      errorMessage = "This voice message can’t be loaded."
    }
  }

  public func toggle() {
    guard let player else { return }
    if player.isPlaying {
      player.pause()
      isPlaying = false
      timer?.invalidate()
      timer = nil
    } else {
      if player.currentTime >= player.duration {
        player.currentTime = 0
      }
      player.play()
      isPlaying = true
      beginProgressUpdates()
    }
  }

  public func seek(to progress: Double) {
    guard let player, player.duration > 0 else { return }
    player.currentTime = min(max(progress, 0), 1) * player.duration
    self.progress = min(max(progress, 0), 1)
  }

  public func stop() {
    timer?.invalidate()
    timer = nil
    player?.stop()
    player = nil
    isPlaying = false
    progress = 0
    duration = 0
  }

  public func audioPlayerDidFinishPlaying(
    _ player: AVAudioPlayer,
    successfully flag: Bool
  ) {
    timer?.invalidate()
    timer = nil
    isPlaying = false
    progress = 1
  }

  private func beginProgressUpdates() {
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) {
      [weak self] _ in
      Task { @MainActor [weak self] in
        guard let self, let player = self.player else { return }
        self.progress = player.duration > 0
          ? min(max(player.currentTime / player.duration, 0), 1)
          : 0
      }
    }
  }
}
