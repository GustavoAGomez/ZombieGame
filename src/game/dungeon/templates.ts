/**
 * The template banks (spec 09 §3.2): the room templates of each ambient,
 * by type. Until the templates are drawn (phase M2) the bank is made of
 * placeholders with the names and sizes of the real one, so the generator
 * and its preview work the same.
 */
import { DUNGEON, floorDifficulties, type Ambient, type RoomDifficulty, type RoomType } from '../../config/dungeon';
import type { TemplateBank, TemplateEntry } from './generateFloor';
import type { RoomTemplate } from './roomTemplate';

/** The floor each ambient first appears on: its placeholders take that floor's difficulties. */
const FIRST_FLOOR: Readonly<Record<Ambient, number>> = { mansion: 1, basement: 2, garden: 3 };

/** `<ambient>/<type>_<n>`: the id a real template of that ambient and type will have. */
export function templateId(ambient: Ambient, type: RoomType, n: number): string {
  return `${ambient}/${type}_${String(n).padStart(2, '0')}`;
}

/** The bank the generator draws from, out of an ambient's real templates (rooms:build). */
export function bankOf(templates: readonly RoomTemplate[]): TemplateBank {
  const bank: Record<RoomType, TemplateEntry[]> = { start: [], combat: [], elite: [], treasure: [], hand: [], challenge: [], boss: [] };
  for (const t of templates) bank[t.type].push({ id: t.id, difficulty: t.difficulty });
  return bank;
}

/** A bank of placeholders for `ambient`: the combat rooms split between the ambient's difficulties, the rest without one. */
export function placeholderBank(ambient: Ambient): TemplateBank {
  const difficulties: readonly RoomDifficulty[] = floorDifficulties(FIRST_FLOOR[ambient]);
  const entries = (type: RoomType): TemplateEntry[] =>
    Array.from({ length: DUNGEON.bank[type] }, (_, i) => ({
      id: templateId(ambient, type, i + 1),
      difficulty: type === 'combat' ? (difficulties[i % difficulties.length] as RoomDifficulty) : null,
    }));
  return { start: entries('start'), combat: entries('combat'), elite: entries('elite'), treasure: entries('treasure'), hand: entries('hand'), challenge: entries('challenge'), boss: entries('boss') };
}
