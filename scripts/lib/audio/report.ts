/**
 * The report of npm run audio:gen (spec 08 §4.4): one row per file and a
 * warning for whatever breaks the sound direction's rules. Reviewed before
 * closing each phase, like a map's preview.
 */
import { AUDIO_GEN, type SoundDef, type SoundFamily } from '../../../src/config/audio';
import { almostIdentical, type SoundMeasures } from './analyze';

export interface ReportRow {
  /** The manifest key (the file's name). */
  key: string;
  measures: SoundMeasures;
}

export interface Report {
  markdown: string;
  warnings: string[];
}

const FAMILY_NAMES: Readonly<Record<SoundFamily, string>> = { hit: 'Golpe', reward: 'Premio', threat: 'Amenaza', ui: 'Interfaz', music: 'Música' };

const ms = (seconds: number): string => `${Math.round(seconds * 1000)} ms`;
const db = (value: number): string => (Number.isFinite(value) ? `${value.toFixed(1)} dB` : '−∞');
const hz = (value: number): string => `${Math.round(value)} Hz`;
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

export function buildReport(rows: readonly ReportRow[], catalog: readonly SoundDef[]): Report {
  const soundOf = new Map<string, SoundDef>();
  for (const s of catalog) for (const v of s.variants) soundOf.set(v, s);
  const warnings: string[] = [];

  for (const { key, measures: m } of rows) {
    const sound = soundOf.get(key);
    if (!sound) {
      warnings.push(`${key}: no lo usa ningún sonido del catálogo (src/config/audio.ts)`);
      continue;
    }
    // A loop has no length of its own: it lasts as long as its weapon fires.
    if (sound.family !== 'music' && !sound.loop) {
      const [min, max] = AUDIO_GEN.familyDurations[sound.family];
      if (m.duration < min || m.duration > max) {
        warnings.push(`${key}: dura ${ms(m.duration)}, fuera del rango de ${FAMILY_NAMES[sound.family]} (${ms(min)}–${ms(max)})`);
      }
    }
    if (m.leadingSilence > AUDIO_GEN.maxLeadingSilence) warnings.push(`${key}: ${ms(m.leadingSilence)} de silencio al principio`);
    if (m.clippedRuns > 0) warnings.push(`${key}: saturado (${m.clippedRuns} tramos recortados)`);
  }

  // Rewards above the hits, and hits under the rewards (§4.4): by each sound's mean brightness.
  const bySound = new Map<SoundDef, SoundMeasures[]>();
  for (const { key, measures } of rows) {
    const sound = soundOf.get(key);
    if (sound) bySound.set(sound, [...(bySound.get(sound) ?? []), measures]);
  }
  const brightnessOf = (family: SoundFamily): { sound: SoundDef; brightness: number }[] =>
    [...bySound].filter(([s]) => s.family === family).map(([sound, ms]) => ({ sound, brightness: mean(ms.map((m) => m.brightness)) }));
  const hits = brightnessOf('hit');
  const rewards = brightnessOf('reward');
  if (hits.length > 0 && rewards.length > 0) {
    const hitMean = mean(hits.map((h) => h.brightness));
    const rewardMean = mean(rewards.map((r) => r.brightness));
    for (const r of rewards) if (r.brightness < hitMean) warnings.push(`${r.sound.id}: Premio más grave (${hz(r.brightness)}) que la media de Golpe (${hz(hitMean)})`);
    for (const h of hits) if (h.brightness > rewardMean) warnings.push(`${h.sound.id}: Golpe más brillante (${hz(h.brightness)}) que la media de Premio (${hz(rewardMean)})`);
  }

  // Variants of one sound almost identical.
  for (const [sound, measures] of bySound) {
    for (let i = 0; i < measures.length; i++) {
      for (let j = i + 1; j < measures.length; j++) {
        const a = measures[i];
        const b = measures[j];
        if (a && b && almostIdentical(a, b)) warnings.push(`${sound.id}: las variantes ${sound.variants[i]} y ${sound.variants[j]} son casi idénticas`);
      }
    }
  }

  const lines = [
    '# Informe de audio:gen',
    '',
    'Generado por `npm run audio:gen` (spec 08 §4.4). Brillo: centro del espectro; más alto, más agudo.',
    '',
    '| Archivo | Sonido | Familia | Duración | Pico | Volumen medio | Brillo |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(({ key, measures: m }) => {
      const sound = soundOf.get(key);
      return `| ${key} | ${sound?.id ?? '—'} | ${sound ? FAMILY_NAMES[sound.family] : '—'} | ${ms(m.duration)} | ${db(m.peakDb)} | ${db(m.loudnessDb)} | ${hz(m.brightness)} |`;
    }),
    '',
    '## Avisos',
    '',
    ...(warnings.length > 0 ? warnings.map((w) => `- ${w}`) : ['Ninguno.']),
    '',
  ];
  return { markdown: lines.join('\n'), warnings };
}
