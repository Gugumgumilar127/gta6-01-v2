// audio.js — one job: every sound in Palmaris Heat, synthesized live with
// WebAudio. There are no audio files: the engine, the sirens, the shots and
// the sun-drenched music loop are all oscillators and filtered noise, so the
// game stays a handful of static files and still sounds alive.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;
  let musicTimer = null;
  let musicStep = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    startMusic();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ctx) return;
    const t0 = now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay = 0) {
    if (!ctx) return;
    const t0 = now() + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  // --- continuous voices -------------------------------------------------

  function setEngine(on, speedRatio) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0.0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    if (!engineOsc) return;
    const t = now();
    if (on) {
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.09);
    } else {
      engineGain.gain.setTargetAtTime(0.0, t, 0.1);
    }
  }

  function setSiren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0.035;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      let high = false;
      sirenFlip = setInterval(() => {
        if (!sirenOsc) return;
        high = !high;
        sirenOsc.frequency.setTargetAtTime(high ? 1180 : 830, now(), 0.03);
      }, 380);
    }
    if (!on && sirenOsc) {
      clearInterval(sirenFlip);
      sirenFlip = null;
      const osc = sirenOsc;
      const gain = sirenGain;
      gain.gain.setTargetAtTime(0.0, now(), 0.08);
      setTimeout(() => {
        try { osc.stop(); } catch (e) { /* already stopped */ }
      }, 300);
      sirenOsc = null;
      sirenGain = null;
    }
  }

  // --- one shots -----------------------------------------------------------

  function shot() {
    noise(0.14, 0.5, 2600);
    tone(160, 0.08, 'square', 0.16, 60);
  }

  function punch() {
    noise(0.08, 0.3, 700);
    tone(110, 0.07, 'sine', 0.25, 55);
  }

  function crash(strength) {
    noise(0.22, Math.min(0.6, 0.2 + strength * 0.4), 900);
    tone(80, 0.18, 'sine', 0.3, 40);
  }

  function skid() {
    noise(0.16, 0.10, 3400);
  }

  function pickup() {
    tone(880, 0.09, 'sine', 0.22);
    tone(1320, 0.14, 'sine', 0.22, null, 0.07);
  }

  function cash() {
    tone(660, 0.09, 'triangle', 0.25);
    tone(880, 0.09, 'triangle', 0.25, null, 0.08);
    tone(1100, 0.16, 'triangle', 0.28, null, 0.16);
  }

  function ring() {
    for (let i = 0; i < 2; i++) {
      tone(1245, 0.12, 'sine', 0.16, null, i * 0.36);
      tone(1245, 0.12, 'sine', 0.16, null, i * 0.36 + 0.16);
    }
  }

  function ui() {
    tone(520, 0.05, 'square', 0.10);
  }

  function bustedJingle() {
    tone(392, 0.22, 'triangle', 0.25);
    tone(330, 0.22, 'triangle', 0.25, null, 0.2);
    tone(262, 0.4, 'triangle', 0.25, null, 0.4);
  }

  // --- music: a lazy tropical loop, Am - F - C - G -------------------------

  const CHORDS = [
    [110.0, 220.0, 261.6, 329.6], // Am
    [87.3, 174.6, 220.0, 261.6], // F
    [130.8, 196.0, 261.6, 329.6], // C
    [98.0, 196.0, 246.9, 392.0], // G
  ];

  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      const chord = CHORDS[Math.floor(musicStep / 4) % CHORDS.length];
      const beat = musicStep % 4;
      if (beat === 0) {
        for (const f of chord.slice(1)) tone(f, 1.5, 'triangle', 0.028);
        tone(chord[0], 1.4, 'sine', 0.09);
      }
      if (beat === 2) tone(chord[0] * 2, 0.5, 'sine', 0.05);
      noise(0.03, 0.012, 6000);
      musicStep++;
    }, 460);
  }

  return {
    unlock, setEngine, setSiren, shot, punch, crash, skid,
    pickup, cash, ring, ui, bustedJingle,
    get ready() { return !!ctx; },
  };
}
