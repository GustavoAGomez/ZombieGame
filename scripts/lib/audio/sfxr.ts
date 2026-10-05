/**
 * The sfxr synthesizer (spec 08 §4.1), ported from jsfxr (chr15m/jsfxr,
 * Unlicense; after DrPetter's sfxr) so its recipes open and come back from
 * sfxr.me: the same parameter names (its JSON) and its base58 links. The
 * one change: the noise comes from a seeded generator instead of
 * Math.random, so the same recipe always gives the same samples (§4.1).
 */

/** jsfxr's parameters: on 0..1, or −1..1 for the signed ones (ramps and offsets). */
export interface SfxrParams {
  /** 0 square, 1 sawtooth, 2 sine, 3 noise. */
  wave_type: number;
  p_env_attack: number;
  p_env_sustain: number;
  p_env_punch: number;
  p_env_decay: number;
  p_base_freq: number;
  p_freq_limit: number;
  p_freq_ramp: number;
  p_freq_dramp: number;
  p_vib_strength: number;
  p_vib_speed: number;
  p_arp_mod: number;
  p_arp_speed: number;
  p_duty: number;
  p_duty_ramp: number;
  p_repeat_speed: number;
  p_pha_offset: number;
  p_pha_ramp: number;
  p_lpf_freq: number;
  p_lpf_ramp: number;
  p_lpf_resonance: number;
  p_hpf_freq: number;
  p_hpf_ramp: number;
}

/** jsfxr's defaults (its Params()). */
export const SFXR_DEFAULTS: Readonly<SfxrParams> = {
  wave_type: 0,
  p_env_attack: 0,
  p_env_sustain: 0.3,
  p_env_punch: 0,
  p_env_decay: 0.4,
  p_base_freq: 0.3,
  p_freq_limit: 0,
  p_freq_ramp: 0,
  p_freq_dramp: 0,
  p_vib_strength: 0,
  p_vib_speed: 0,
  p_arp_mod: 0,
  p_arp_speed: 0,
  p_duty: 0,
  p_duty_ramp: 0,
  p_repeat_speed: 0,
  p_pha_offset: 0,
  p_pha_ramp: 0,
  p_lpf_freq: 1,
  p_lpf_ramp: 0,
  p_lpf_resonance: 0,
  p_hpf_freq: 0,
  p_hpf_ramp: 0,
};

/** The order of the parameters in an sfxr.me link (jsfxr's params_order). */
const LINK_ORDER = Object.keys(SFXR_DEFAULTS) as (keyof SfxrParams)[];
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const OVERSAMPLING = 8;
/** No sound lasts longer than this (a recipe that never ends), samples. */
const MAX_SAMPLES = 44100 * 10;

/** A 32-bit float from its bits (little-endian bytes of an sfxr.me link). */
function floatFromBits(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits >>> 0);
  return view.getFloat32(0);
}

/**
 * Reads an sfxr.me link (https://sfxr.me/#<base58>) or the bare base58
 * code: the wave type in one byte, then each parameter as a 32-bit float.
 */
export function sfxrFromLink(link: string): SfxrParams {
  const code = link.includes('#') ? link.slice(link.indexOf('#') + 1) : link.trim();
  // Base58 to bytes (jsfxr's decoder).
  const digits: number[] = [];
  const bytes: number[] = [];
  for (let i = 0; i < code.length; i++) {
    let carry = B58.indexOf(code[i] ?? '');
    if (carry < 0) throw new Error(`enlace de sfxr no válido: «${code[i]}» no es base58`);
    if (carry === 0 && bytes.length === i) bytes.push(0);
    for (let j = 0; j < digits.length || carry; j++) {
      const n = (digits[j] ?? 0) * 58 + carry;
      carry = n >> 8;
      digits[j] = n % 256;
    }
  }
  for (let j = digits.length - 1; j >= 0; j--) bytes.push(digits[j] ?? 0);
  if (bytes.length < 1 + (LINK_ORDER.length - 1) * 4) throw new Error('enlace de sfxr incompleto');
  const params = { ...SFXR_DEFAULTS };
  LINK_ORDER.forEach((name, i) => {
    if (name === 'wave_type') {
      params.wave_type = bytes[0] ?? 0;
      return;
    }
    const o = (i - 1) * 4 + 1;
    const bits = (bytes[o] ?? 0) | ((bytes[o + 1] ?? 0) << 8) | ((bytes[o + 2] ?? 0) << 16) | ((bytes[o + 3] ?? 0) << 24);
    params[name] = floatFromBits(bits);
  });
  return params;
}

/** A small seeded generator (mulberry32): 0..1. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Renders sfxr parameters to float samples at 44.1 kHz (jsfxr's SoundEffect.getRawBuffer). */
export function renderSfxr(ps: SfxrParams, seed: number): Float32Array {
  const random = seeded(seed);
  const wave = Math.floor(ps.wave_type);

  // Filters.
  let fltw = ps.p_lpf_freq ** 3 * 0.1;
  const enableLowPass = ps.p_lpf_freq !== 1;
  const fltwD = 1 + ps.p_lpf_ramp * 0.0001;
  let fltdmp = (5 / (1 + ps.p_lpf_resonance ** 2 * 20)) * (0.01 + fltw);
  if (fltdmp > 0.8) fltdmp = 0.8;
  let flthp = ps.p_hpf_freq ** 2 * 0.1;
  const flthpD = 1 + ps.p_hpf_ramp * 0.0003;
  // Vibrato.
  const vibSpeed = ps.p_vib_speed ** 2 * 0.01;
  const vibAmp = ps.p_vib_strength * 0.5;
  // Envelope: attack, sustain, decay, in samples.
  const envLength = [Math.floor(ps.p_env_attack ** 2 * 100000), Math.floor(ps.p_env_sustain ** 2 * 100000), Math.floor(ps.p_env_decay ** 2 * 100000)];
  // Flanger.
  let flangerOffset = ps.p_pha_offset ** 2 * 1020 * (ps.p_pha_offset < 0 ? -1 : 1);
  const flangerSlide = ps.p_pha_ramp ** 2 * (ps.p_pha_ramp < 0 ? -1 : 1);
  // Repeat.
  const repeatTime = ps.p_repeat_speed === 0 ? 0 : Math.floor((1 - ps.p_repeat_speed) ** 2 * 20000 + 32);

  let period = 0;
  let periodMax = 0;
  let periodMult = 0;
  let periodMultSlide = 0;
  let dutyCycle = 0;
  let dutyCycleSlide = 0;
  let arpMultiplier = 0;
  let arpTime = 0;
  let sinceRepeat = 0;
  const initForRepeat = (): void => {
    sinceRepeat = 0;
    period = 100 / (ps.p_base_freq ** 2 + 0.001);
    periodMax = 100 / (ps.p_freq_limit ** 2 + 0.001);
    periodMult = 1 - ps.p_freq_ramp ** 3 * 0.01;
    periodMultSlide = -(ps.p_freq_dramp ** 3) * 0.000001;
    dutyCycle = 0.5 - ps.p_duty * 0.5;
    dutyCycleSlide = -ps.p_duty_ramp * 0.00005;
    arpMultiplier = ps.p_arp_mod >= 0 ? 1 - ps.p_arp_mod ** 2 * 0.9 : 1 + ps.p_arp_mod ** 2 * 10;
    arpTime = ps.p_arp_speed === 1 ? 0 : Math.floor((1 - ps.p_arp_speed) ** 2 * 20000 + 32);
  };
  initForRepeat();
  const enableCutoff = ps.p_freq_limit > 0;

  const noise = new Float64Array(32);
  for (let i = 0; i < 32; i++) noise[i] = random() * 2 - 1;
  const flanger = new Float64Array(1024);
  let fltp = 0;
  let fltdp = 0;
  let fltphp = 0;
  let envStage = 0;
  let envElapsed = 0;
  let vibPhase = 0;
  let phase = 0;
  let ipp = 0;
  const out: number[] = [];

  for (let t = 0; out.length < MAX_SAMPLES; t++) {
    if (repeatTime !== 0 && ++sinceRepeat >= repeatTime) initForRepeat();
    if (arpTime !== 0 && t >= arpTime) {
      arpTime = 0;
      period *= arpMultiplier;
    }
    periodMult += periodMultSlide;
    period *= periodMult;
    if (period > periodMax) {
      period = periodMax;
      if (enableCutoff) break;
    }
    let rfperiod = period;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = period * (1 + Math.sin(vibPhase) * vibAmp);
    }
    let iperiod = Math.floor(rfperiod);
    if (iperiod < OVERSAMPLING) iperiod = OVERSAMPLING;
    dutyCycle = Math.min(0.5, Math.max(0, dutyCycle + dutyCycleSlide));

    if (++envElapsed > (envLength[envStage] ?? 0)) {
      envElapsed = 0;
      if (++envStage > 2) break;
    }
    // A stage of length 0 lasts one sample (jsfxr divides by 0 there and gives NaN).
    const envf = envElapsed / (envLength[envStage] || 1);
    const envVol = envStage === 0 ? envf : envStage === 1 ? 1 + (1 - envf) * 2 * ps.p_env_punch : 1 - envf;

    flangerOffset += flangerSlide;
    const iphase = Math.min(1023, Math.abs(Math.floor(flangerOffset)));
    if (flthpD !== 0) flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpD));

    let sample = 0;
    for (let si = 0; si < OVERSAMPLING; si++) {
      let sub: number;
      phase++;
      if (phase >= iperiod) {
        phase %= iperiod;
        if (wave === 3) for (let i = 0; i < 32; i++) noise[i] = random() * 2 - 1;
      }
      const fp = phase / iperiod;
      if (wave === 0) sub = fp < dutyCycle ? 0.5 : -0.5;
      else if (wave === 1) sub = fp < dutyCycle ? -1 + (2 * fp) / dutyCycle : 1 - (2 * (fp - dutyCycle)) / (1 - dutyCycle);
      else if (wave === 2) sub = Math.sin(fp * 2 * Math.PI);
      else sub = noise[Math.floor((phase * 32) / iperiod)] ?? 0;

      const pp = fltp;
      fltw = Math.min(0.1, Math.max(0, fltw * fltwD));
      if (enableLowPass) {
        fltdp += (sub - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sub;
        fltdp = 0;
      }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sub = fltphp;

      flanger[ipp & 1023] = sub;
      sub += flanger[(ipp - iphase + 1024) & 1023] ?? 0;
      ipp = (ipp + 1) & 1023;
      sample += sub * envVol;
    }
    out.push(sample / OVERSAMPLING);
  }
  return Float32Array.from(out);
}
