/**
 * The report of npm run audio:gen (spec 08 §4.5): one row per file and a
 * warning for whatever breaks the sound direction's rules. Reviewed before
 * closing each phase, like a map's preview.
 */
import { AUDIO_GEN, type SoundDef, type SoundFamily } from '../../../src/config/audio';
import { almostIdentical, type SoundMeasures } from './analyze';

export interface ReportRow {
  /** The manifest key (the file's name). */
  key: string;
  sound: SoundDef;
  /** The candidate it comes from, and whether it is the one the game plays. */
  letter: string;
  inGame: boolean;
  /** Its candidate's line on what makes it different. */
  about: string;
  /** A variant's file, or a streak sound's shine layer (§3.4). */
  layer: 'body' | 'shine';
  measures: SoundMeasures;
}

export interface Report {
  markdown: string;
  warnings: string[];
}

const FAMILY_NAMES: Readonly<Record<SoundFamily, string>> = { hit: 'Golpe', reward: 'Premio', threat: 'Amenaza', ui: 'Interfaz', jingle: 'Carteles', music: 'Música' };

const ms = (seconds: number): string => `${Math.round(seconds * 1000)} ms`;
const db = (value: number): string => (Number.isFinite(value) ? `${value.toFixed(1)} dB` : '−∞');
const hz = (value: number): string => `${Math.round(value)} Hz`;
const pct = (share: number): string => `${Math.round(share * 100)}`;
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

export function buildReport(rows: readonly ReportRow[]): Report {
  const warnings: string[] = [];

  for (const { key, sound, measures: m } of rows) {
    if (sound.length !== null) {
      // Its own length (the hand's draw lasts as the draw), instead of its family's range.
      if (Math.abs(m.duration - sound.length) > AUDIO_GEN.lengthTolerance) warnings.push(`${key}: dura ${ms(m.duration)} y tiene que durar ${ms(sound.length)}`);
    } else if (sound.family !== 'music' && !sound.loop) {
      // Its family's length and tail; a loop has none of its own: it repeats while it sounds.
      const { duration: [min, max], tail } = AUDIO_GEN.families[sound.family];
      if (m.duration < min || m.duration > max) warnings.push(`${key}: dura ${ms(m.duration)}, fuera del rango de ${FAMILY_NAMES[sound.family]} (${ms(min)}–${ms(max)})`);
      if (m.tail > tail) warnings.push(`${key}: cola de ${ms(m.tail)}, más que el máximo de ${FAMILY_NAMES[sound.family]} (${ms(tail)})`);
    }
    if (!sound.loop && m.leadingSilence > AUDIO_GEN.maxLeadingSilence) warnings.push(`${key}: ${ms(m.leadingSilence)} de silencio al principio`);
    if (m.clippedRuns > 0) warnings.push(`${key}: saturado (${m.clippedRuns} tramos recortados)`);
    const low = m.bands[0] ?? 0;
    if (low > AUDIO_GEN.maxLowShare) warnings.push(`${key}: ${pct(low)} % de la energía por debajo de 100 Hz: en el móvil no se oirá`);
    if (sound.positional && m.channels > 1) warnings.push(`${key}: es estéreo y ${sound.id} es posicional`);
  }

  // Rewards above the hits, and hits under the rewards (§4.5), in the game's files: each sound's mean dominant
  // pitch against the other family's median. Pitch, not brightness: a gunshot's noise has a higher centroid than a
  // bell in A5, and sounds lower. A streak sound counts by its shine: its body is a blow on purpose (§3.4).
  const inGame = rows.filter((r) => r.inGame);
  const bySound = new Map<SoundDef, SoundMeasures[]>();
  for (const r of inGame) {
    if (r.sound.shine.length > 0 && r.layer === 'body') continue;
    bySound.set(r.sound, [...(bySound.get(r.sound) ?? []), r.measures]);
  }
  const pitchOf = (family: SoundFamily): { sound: SoundDef; pitch: number }[] =>
    [...bySound].filter(([s]) => s.family === family).map(([sound, list]) => ({ sound, pitch: mean(list.map((m) => m.pitch)) }));
  const hits = pitchOf('hit');
  const rewards = pitchOf('reward');
  if (hits.length > 0 && rewards.length > 0) {
    const hitMedian = median(hits.map((h) => h.pitch));
    const rewardMedian = median(rewards.map((r) => r.pitch));
    for (const r of rewards) if (r.pitch < hitMedian) warnings.push(`${r.sound.id}: Premio más grave (tono ${hz(r.pitch)}) que los de Golpe (mediana ${hz(hitMedian)})`);
    for (const h of hits) if (h.pitch > rewardMedian) warnings.push(`${h.sound.id}: Golpe más agudo (tono ${hz(h.pitch)}) que los de Premio (mediana ${hz(rewardMedian)})`);
  }

  // Variants of one candidate almost identical.
  const byCandidate = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const id = `${r.sound.id} ${r.letter}`;
    byCandidate.set(id, [...(byCandidate.get(id) ?? []), r]);
  }
  for (const [id, list] of byCandidate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a && b && almostIdentical(a.measures, b.measures)) warnings.push(`${id}: las variantes ${a.key} y ${b.key} son casi idénticas`);
      }
    }
  }

  const [b0, b1, b2, b3] = AUDIO_GEN.bands;
  const lines = [
    '# Informe de audio:gen',
    '',
    'Generado por `npm run audio:gen` (spec 08 §4.5). Brillo: centro del espectro; más alto, más brillante. Tono: la frecuencia más fuerte (su nota, o la de su cuerpo); es la que compara Premio con Golpe. Cola: lo que sigue al último momento a menos de 20 dB del pico.',
    `Bandas: porcentaje de la energía por debajo de ${b0} Hz, ${b0}–${b1}, ${b1}–${b2}, ${b2}–${b3} y por encima de ${b3} Hz.`,
    '',
    '| Archivo | Sonido | Cand. | Familia | Canales | Duración | Cola | Pico | Volumen medio | Brillo | Tono | Bandas (%) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      ({ key, sound, letter, inGame: game, measures: m }) =>
        `| ${key} | ${sound.id} | ${letter}${game ? ' ✓' : ''} | ${FAMILY_NAMES[sound.family]}${sound.loop ? ' (bucle)' : ''} | ${m.channels === 1 ? 'mono' : 'estéreo'} | ${ms(m.duration)} | ${ms(m.tail)} | ${db(m.peakDb)} | ${db(m.loudnessDb)} | ${hz(m.brightness)} | ${hz(m.pitch)} | ${m.bands.map(pct).join(' · ')} |`,
    ),
    '',
    'Cand.: el candidato del que sale el archivo; ✓ el que suena en el juego.',
    '',
    '## Candidatos',
    '',
    ...[...byCandidate].map(([id, list]) => `- **${id}**${list[0]?.inGame ? ' (en el juego)' : ''}: ${list[0]?.about || '—'}`),
    '',
    '## Avisos',
    '',
    ...(warnings.length > 0 ? warnings.map((w) => `- ${w}`) : ['Ninguno.']),
    '',
  ];
  return { markdown: lines.join('\n'), warnings };
}
