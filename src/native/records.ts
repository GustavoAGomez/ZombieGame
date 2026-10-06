import { browserStorage, type PreferenceStorage } from './preferences';

/**
 * The records kept on the device (spec 09 §10), beside the preferences:
 * Survival's best round, and the dungeon's best floor, most rooms, wins
 * and best winning time. Storage can be missing or corrupt: reads fall
 * back to no record and writes are best effort.
 */
export interface RecordValues {
  survival: { bestRound: number };
  dungeon: {
    bestFloor: number;
    mostRooms: number;
    wins: number;
    /** Seconds of the fastest win, or null without one. */
    bestWinTime: number | null;
  };
}

/** What a dungeon run ends with (§10). */
export interface RunResult {
  floor: number;
  rooms: number;
  won: boolean;
  /** Seconds of play. */
  time: number;
}

const KEY = 'zombies.records';

function none(): RecordValues {
  return { survival: { bestRound: 0 }, dungeon: { bestFloor: 0, mostRooms: 0, wins: 0, bestWinTime: null } };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function load(storage: PreferenceStorage | null): RecordValues {
  const values = none();
  try {
    const raw = storage?.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (typeof saved !== 'object' || saved === null) return values;
    const { survival, dungeon } = saved as { survival?: unknown; dungeon?: unknown };
    if (typeof survival === 'object' && survival !== null) values.survival.bestRound = count((survival as { bestRound?: unknown }).bestRound);
    if (typeof dungeon === 'object' && dungeon !== null) {
      const d = dungeon as Partial<Record<keyof RecordValues['dungeon'], unknown>>;
      values.dungeon.bestFloor = count(d.bestFloor);
      values.dungeon.mostRooms = count(d.mostRooms);
      values.dungeon.wins = count(d.wins);
      const time = d.bestWinTime;
      values.dungeon.bestWinTime = typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null;
    }
    return values;
  } catch {
    return none();
  }
}

export class Records {
  private values: RecordValues;

  constructor(private readonly storage: PreferenceStorage | null = browserStorage()) {
    this.values = load(storage);
  }

  get all(): Readonly<RecordValues> {
    return this.values;
  }

  /** A Survival match over at `round`: true when it beats the record. */
  recordSurvival(round: number): boolean {
    if (round <= this.values.survival.bestRound) return false;
    this.values.survival.bestRound = round;
    this.save();
    return true;
  }

  /** A dungeon run over (§10): true when any of its records fell. */
  recordRun(result: RunResult): boolean {
    const d = this.values.dungeon;
    let beaten = false;
    if (result.floor > d.bestFloor) {
      d.bestFloor = result.floor;
      beaten = true;
    }
    if (result.rooms > d.mostRooms) {
      d.mostRooms = result.rooms;
      beaten = true;
    }
    if (result.won) {
      d.wins++;
      if (d.bestWinTime === null || result.time < d.bestWinTime) {
        d.bestWinTime = result.time;
        beaten = true;
      }
    }
    this.save();
    return beaten;
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Best effort: the records live on without storage.
    }
  }
}
