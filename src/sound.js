export class RetroSound {
  constructor() {
    this.context = null;
  }

  unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      this.context = new AudioContextClass();
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }
  }

  beep() {
    this.tone(660, 0.05, "square", 0.045);
  }

  perfect() {
    this.tone(880, 0.05, "square", 0.05, 0);
    this.tone(1180, 0.08, "triangle", 0.04, 0.05);
  }

  tree() {
    this.tone(180, 0.09, "sawtooth", 0.06);
  }

  splash() {
    this.tone(220, 0.06, "triangle", 0.05, 0);
    this.tone(150, 0.11, "triangle", 0.05, 0.04);
  }

  hole() {
    this.tone(660, 0.06, "square", 0.04, 0);
    this.tone(880, 0.08, "square", 0.04, 0.08);
    this.tone(1180, 0.1, "triangle", 0.04, 0.16);
  }

  click() {
    this.tone(440, 0.04, "square", 0.03);
  }

  tone(frequency, duration, type, volume, delay = 0) {
    if (!this.context) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    const end = start + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

export class BackgroundMusic {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = 0.34;
    this.enabled = false;
  }

  async setEnabled(enabled) {
    this.enabled = enabled;

    if (!enabled) {
      this.audio.pause();
      return true;
    }

    return this.play();
  }

  async play() {
    if (!this.enabled || !this.audio.src) {
      return false;
    }

    try {
      await this.audio.play();
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    this.audio.pause();
  }

  async setTrack(src, autoplay = false) {
    const shouldResume = autoplay && this.enabled;
    this.audio.pause();
    this.audio.src = src;
    this.audio.load();

    if (!shouldResume) {
      return true;
    }

    return this.play();
  }
}
