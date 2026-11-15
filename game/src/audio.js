// audio.js — all sound is synthesised with WebAudio at play time.
// No audio files ship with the game: gunfire is filtered noise bursts,
// the charge beeps are square blips, footsteps are soft thuds. One shared
// context, created lazily on the first user gesture (the Play click).

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

let sharedNoise = null;
function burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass', slideTo = null }) {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const src = ctx.createBufferSource();
  src.buffer = sharedNoise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start(); src.stop(ctx.currentTime + dur + 0.02);
}

function tone({ freq = 440, dur = 0.09, gain = 0.2, type = 'square', slideTo = null }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type; osc.frequency.value = freq;
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g); g.connect(master);
  osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
}

// Distance-attenuated shot: the same synth, quieter and duller far away.
export function playShot(weaponId, dist = 0) {
  if (!ctx) return;
  const att = 1 / (1 + dist * 0.06);
  if (weaponId === 'shotgun') {
    burst({ dur: 0.28, freq: 900, gain: 0.8 * att, slideTo: 220 });
    burst({ dur: 0.1, freq: 2600, gain: 0.4 * att });
  } else if (weaponId === 'dmr') {
    burst({ dur: 0.22, freq: 1300, gain: 0.7 * att, slideTo: 300 });
    tone({ freq: 120, dur: 0.16, gain: 0.3 * att, type: 'triangle', slideTo: 55 });
  } else if (weaponId === 'smg') {
    burst({ dur: 0.08, freq: 2100, gain: 0.42 * att, slideTo: 700 });
  } else if (weaponId === 'pistol') {
    burst({ dur: 0.1, freq: 1700, gain: 0.5 * att, slideTo: 500 });
  } else {
    burst({ dur: 0.14, freq: 1600, gain: 0.6 * att, slideTo: 420 });
    tone({ freq: 95, dur: 0.1, gain: 0.22 * att, type: 'triangle', slideTo: 50 });
  }
}

export function playDryFire() { tone({ freq: 2200, dur: 0.03, gain: 0.12, type: 'square' }); }
export function playReloadStart() { burst({ dur: 0.06, freq: 900, gain: 0.25, type: 'highpass' }); }
export function playReloadEnd() { burst({ dur: 0.05, freq: 1400, gain: 0.3, type: 'highpass' }); tone({ freq: 700, dur: 0.04, gain: 0.1 }); }
export function playHit(head) { tone({ freq: head ? 1560 : 1180, dur: 0.05, gain: 0.22, type: 'sine' }); }
export function playHurt() { tone({ freq: 220, dur: 0.12, gain: 0.25, type: 'sawtooth', slideTo: 130 }); }
export function playFootstep(run) { burst({ dur: 0.05, freq: 300, gain: run ? 0.10 : 0.05, type: 'lowpass' }); }
export function playBeep(final) { tone({ freq: final ? 1760 : 1180, dur: final ? 0.16 : 0.07, gain: 0.2, type: 'square' }); }
export function playPlantDone() { tone({ freq: 880, dur: 0.08, gain: 0.2 }); setTimeout(() => tone({ freq: 1320, dur: 0.12, gain: 0.2 }), 90); }
export function playExplosion() {
  if (!ctx) return;
  burst({ dur: 0.9, freq: 300, gain: 1.0, type: 'lowpass', slideTo: 60 });
  tone({ freq: 70, dur: 0.8, gain: 0.6, type: 'sine', slideTo: 32 });
}
export function playThrow() { burst({ dur: 0.09, freq: 600, gain: 0.15, slideTo: 1400 }); }
export function playFlashbang() { burst({ dur: 0.3, freq: 4000, gain: 0.5, type: 'highpass' }); tone({ freq: 3400, dur: 0.5, gain: 0.1, type: 'sine' }); }
export function playBuy() { tone({ freq: 990, dur: 0.05, gain: 0.15 }); setTimeout(() => tone({ freq: 1480, dur: 0.07, gain: 0.15 }), 60); }
export function playRoundWin(win) {
  if (!ctx) return;
  const notes = win ? [660, 880, 1100] : [440, 350, 262];
  notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.14, gain: 0.18, type: 'triangle' }), i * 110));
}
