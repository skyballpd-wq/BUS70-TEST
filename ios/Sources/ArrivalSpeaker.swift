import AVFoundation

final class ArrivalSpeaker: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var completion: ((Bool) -> Void)?
    override init() {
        super.init(); synth.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted), name: AVAudioSession.interruptionNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    @objc private func interrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        DispatchQueue.main.async { [weak self] in self?.cancel() }
    }
    func speak(_ text: String, completion: @escaping (Bool) -> Void) -> Bool {
        guard !synth.isSpeaking, self.completion == nil, let voice = AVSpeechSynthesisVoice(language: "ko-KR") else { return false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
            try session.setActive(true)
            synth.usesApplicationAudioSession = true
            self.completion = completion
            let speech = AVSpeechUtterance(string: text); speech.voice = voice; speech.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
            synth.speak(speech); return true
        } catch { return false }
    }
    func cancel() { synth.stopSpeaking(at: .immediate); finish(false) }
    private func finish(_ success: Bool) {
        guard Thread.isMainThread else { DispatchQueue.main.async { [weak self] in self?.finish(success) }; return }
        let callback = completion; completion = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        callback?(success)
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { finish(true) }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { finish(false) }
}
