// ============================================================================
// VOICE INPUT — Web Speech API wrapper
// ============================================================================

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const isVoiceSupported = !!SpeechRecognition;

export class VoiceRecognizer {
  constructor() {
    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    this.isListening = false;
    this.transcript = '';
    this.onResult = null;
    this.onError = null;

    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'es-ES';

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event) => {
        this.transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          this.transcript += event.results[i][0].transcript;
        }
        if (this.onResult) this.onResult(this.transcript);
      };

      this.recognition.onerror = (event) => {
        if (this.onError) this.onError(event.error);
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    }
  }

  start() {
    if (!this.recognition) return;
    this.transcript = '';
    this.recognition.start();
  }

  stop() {
    if (!this.recognition) return;
    this.recognition.stop();
  }

  abort() {
    if (!this.recognition) return;
    this.recognition.abort();
  }

  setLanguage(lang) {
    if (!this.recognition) return;
    this.recognition.lang = lang;
  }
}