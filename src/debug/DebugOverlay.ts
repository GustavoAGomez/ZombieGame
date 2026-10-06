import type { SoundTest } from '../audio/AudioDirector';
import type { SoundFamily } from '../config/audio';
import { STRINGS } from '../ui/strings';
import { choiceText, loadTrials, saveTrials, type TrialStorage } from './soundTrials';
import './debug.css';

export interface DebugStats {
  fps: number;
  [label: string]: number | string;
}

/**
 * What the debug buttons can do, provided by the running game scene. The
 * toggles return their new state so the button shows it.
 */
export interface DebugActions {
  nextRound(): void;
  /** Spec 07 §10: straight to the first boss round, or to the next one in the calendar (the zombies and bosses on the map go). */
  goToBossRound(): void;
  nextBossRound(): void;
  /** Spec 07 §10: the variant INVOCAR MATARIFE uses, in turns; returns the button's new label. */
  cycleBossVariant(): string;
  /** Spec 07 §10: every boss blow's real damage zone drawn over the world. */
  toggleBossZones(): boolean;
  addPoints(): void;
  toggleGod(): boolean;
  toggleHitboxes(): boolean;
  toggleFlowField(): boolean;
  /** Spec 03 §7: the weapon in hand one level up; its special on or off. */
  levelUpWeapon(): void;
  toggleWeaponSpecial(): boolean;
  /** A temporary boost in the slot, speed and double damage in turns. */
  giveBoost(): void;
  /** Every merchant on the map teleports now. */
  moveMerchants(): void;
  /** The red and gold merchants, off in a normal match, on (and on the map) or off again. */
  toggleRedGold(): boolean;
  addManyPoints(): void;
  /** Spec 04 §5: the weapon into a free slot (or in place of the one in hand), full of ammo. */
  giveSmg(): void;
  giveShotgun(): void;
  /** Spec 06 §5: the special weapons, which only the Demon's Hand gives in a match. */
  giveKatana(): void;
  giveLaser(): void;
  giveFlamethrower(): void;
  /** Spec 06 §5: the Demon's Hand takes no payment (on/off), moves now, mocks at the next payment, and its spots drawn. */
  toggleFreeHand(): boolean;
  moveHand(): void;
  forceMock(): void;
  toggleHandSpots(): boolean;
  /** Spec 05 §8: the heart and the wand into the inventory (off the floor: items are unique). */
  giveItems(): void;
  /** Spec 05 §8: the player next to the wand, while it is still on the floor. */
  goToWand(): void;
  /** Spec 05 §8: every item spot on the map (the wand's ringed) and the activation sites. */
  toggleItemSpots(): boolean;
  /** Spec 07 §10: Matarife comes into the match now; the bosses on the map die. */
  summonBoss(): void;
  killBoss(): void;
  /** The bosses' next attack is this one, as soon as they finish what they are doing. */
  forceAttack(attack: 'charge' | 'slam' | 'leap'): void;
}

const TRIPLE_TAP_WINDOW_MS = 600;
const REFRESH_MS = 250;

/**
 * Debug panel (spec 01 §8, spec 03 §7, spec 04 §5, spec 05 §8, spec 06 §5,
 * spec 07 §10). Enabled with ?debug=1 or a triple tap on the top-left
 * corner. Folded, only its stats show, at the top left under the HUD; a tap
 * on them opens a sheet over the whole screen with every button at a
 * glance, big enough for a thumb (no scrolling: it did not work on a phone),
 * which stays open while they are used and folds back with CERRAR. Stats
 * are pulled on a timer, never every frame. The buttons act on release and
 * only while a match is running: rounds, money, god mode, drawings
 * (hitboxes, flow field, spots), weapons and their upgrades, boosts,
 * merchants, special items, the Demon's Hand and the bosses.
 * PRUEBA DE SONIDOS (spec 08 §8) opens a second sheet with every sound of
 * the catalog, a tab per family, which works with or without a match.
 */
export class DebugOverlay {
  /** Folded: the stats alone at the top left; a tap on them opens the sheet. */
  private readonly panel: HTMLDivElement;
  /** Open: every button over the whole screen, with a button to fold it back. */
  private readonly sheet: HTMLDivElement;
  private readonly statsEl: HTMLPreElement;
  /** The sound test: every sound of the catalog, played as in the game. */
  private readonly soundSheet: HTMLDivElement;
  private readonly soundStatsEl: HTMLParagraphElement;
  /** Draws the sound test's list again (the candidates are known once the manifest has loaded). */
  private redrawSounds: () => void = () => undefined;
  private timer = 0;
  private visible = false;

  constructor(
    root: HTMLElement,
    private readonly readStats: () => DebugStats,
    enabled: boolean,
    actions: () => DebugActions | null = () => null,
    private readonly sounds: SoundTest | null = null,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.statsEl = document.createElement('pre');
    const buttons = document.createElement('div');
    buttons.className = 'debug-buttons';
    // A toggle returns its new state (the button lights up); a selector, its new label.
    const button = (label: string, run: (a: DebugActions) => boolean | string | void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'debug-button';
      b.textContent = label;
      b.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const a = actions();
        if (!a) return;
        const on = run(a);
        if (typeof on === 'boolean') b.classList.toggle('is-on', on);
        else if (typeof on === 'string') b.textContent = on;
      });
      buttons.appendChild(b);
    };
    button(STRINGS.debug.nextRound, (a) => a.nextRound());
    button(STRINGS.debug.points, (a) => a.addPoints());
    button(STRINGS.debug.god, (a) => a.toggleGod());
    button(STRINGS.debug.hitboxes, (a) => a.toggleHitboxes());
    button(STRINGS.debug.flowField, (a) => a.toggleFlowField());
    button(STRINGS.debug.levelUp, (a) => a.levelUpWeapon());
    button(STRINGS.debug.special, (a) => a.toggleWeaponSpecial());
    button(STRINGS.debug.boost, (a) => a.giveBoost());
    button(STRINGS.debug.moveMerchants, (a) => a.moveMerchants());
    button(STRINGS.debug.redGold, (a) => a.toggleRedGold());
    button(STRINGS.debug.bigPoints, (a) => a.addManyPoints());
    button(STRINGS.debug.giveSmg, (a) => a.giveSmg());
    button(STRINGS.debug.giveShotgun, (a) => a.giveShotgun());
    button(STRINGS.debug.giveKatana, (a) => a.giveKatana());
    button(STRINGS.debug.giveLaser, (a) => a.giveLaser());
    button(STRINGS.debug.giveFlamethrower, (a) => a.giveFlamethrower());
    button(STRINGS.debug.freeHand, (a) => a.toggleFreeHand());
    button(STRINGS.debug.moveHand, (a) => a.moveHand());
    button(STRINGS.debug.forceMock, (a) => a.forceMock());
    button(STRINGS.debug.handSpots, (a) => a.toggleHandSpots());
    button(STRINGS.debug.giveItems, (a) => a.giveItems());
    button(STRINGS.debug.goToWand, (a) => a.goToWand());
    button(STRINGS.debug.itemSpots, (a) => a.toggleItemSpots());
    button(STRINGS.debug.goToBossRound, (a) => a.goToBossRound());
    button(STRINGS.debug.nextBossRound, (a) => a.nextBossRound());
    button(STRINGS.debug.bossVariant(STRINGS.bosses.variants.base), (a) => a.cycleBossVariant());
    button(STRINGS.debug.summonBoss, (a) => a.summonBoss());
    button(STRINGS.debug.killBoss, (a) => a.killBoss());
    button(STRINGS.debug.forceCharge, (a) => a.forceAttack('charge'));
    button(STRINGS.debug.forceSlam, (a) => a.forceAttack('slam'));
    button(STRINGS.debug.forceLeap, (a) => a.forceAttack('leap'));
    button(STRINGS.debug.bossZones, (a) => a.toggleBossZones());
    this.panel.append(this.statsEl);
    this.panel.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.setOpen(true);
    });

    // The sheet: a title, the button that folds it back to the top left, and every button at a glance (no scrolling).
    this.sheet = document.createElement('div');
    this.sheet.className = 'debug-sheet';
    this.sheet.hidden = true;
    const head = document.createElement('div');
    head.className = 'debug-sheet__head';
    const title = document.createElement('span');
    title.className = 'debug-sheet__title';
    title.textContent = STRINGS.debug.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'debug-button debug-sheet__close';
    close.textContent = STRINGS.debug.close;
    close.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.setOpen(false);
    });
    head.append(title, close);
    this.sheet.append(head, buttons);

    this.soundStatsEl = document.createElement('p');
    this.soundStatsEl.className = 'debug-sound-stats';
    this.soundSheet = this.buildSoundSheet();
    if (this.sounds) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'debug-button debug-button--sounds';
      open.textContent = STRINGS.debug.soundTest;
      open.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.setSoundsOpen(true);
      });
      buttons.appendChild(open);
    }
    root.append(this.panel, this.sheet, this.soundSheet);

    const corner = document.createElement('div');
    corner.className = 'debug-corner';
    root.appendChild(corner);
    let taps: number[] = [];
    corner.addEventListener('pointerdown', (e) => {
      const now = e.timeStamp;
      taps = taps.filter((t) => now - t < TRIPLE_TAP_WINDOW_MS);
      taps.push(now);
      if (taps.length >= 3) {
        taps = [];
        this.setVisible(!this.visible);
      }
    });

    this.setVisible(enabled);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Opens the sheet over the whole screen, or folds it back to the stats at the top left. */
  setOpen(open: boolean): void {
    this.sheet.hidden = !open;
    this.soundSheet.hidden = true;
    this.sounds?.setTesting(false);
    this.panel.hidden = open;
  }

  /** The sound test over the debug sheet (the match silent under it), or back to it. */
  private setSoundsOpen(open: boolean): void {
    this.soundSheet.hidden = !open;
    this.sheet.hidden = open;
    this.sounds?.setTesting(open);
    if (open) this.redrawSounds();
    this.refresh();
  }

  /**
   * The sound test (spec 08 §8): a tab per family and a button per sound,
   * which plays it as the game would (its variant, pitch and limits), and
   * the voices playing and the plays dropped by a limit.
   */
  private buildSoundSheet(): HTMLDivElement {
    const sheet = document.createElement('div');
    sheet.className = 'debug-sheet debug-sheet--sounds';
    sheet.hidden = true;
    const head = document.createElement('div');
    head.className = 'debug-sheet__head';
    const title = document.createElement('span');
    title.className = 'debug-sheet__title';
    title.textContent = STRINGS.debug.soundTest;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'debug-button debug-sheet__close';
    back.textContent = STRINGS.debug.soundBack;
    back.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.setSoundsOpen(false);
    });
    head.append(title, back);
    const tabs = document.createElement('div');
    tabs.className = 'debug-sound-tabs';
    const list = document.createElement('div');
    list.className = 'debug-buttons debug-sound-list';
    const actions = document.createElement('div');
    actions.className = 'debug-sound-tabs';
    const hint = document.createElement('p');
    hint.className = 'debug-sound-stats';
    hint.textContent = STRINGS.debug.soundTestHint;
    // The candidates on trial, as the text to send in the chat.
    const choice = document.createElement('pre');
    choice.className = 'debug-sound-choice';
    sheet.append(head, this.soundStatsEl, hint, actions, choice, tabs, list);
    const sounds = this.sounds;
    if (!sounds) return sheet;
    // «Probar en partida»: the trials kept on this device come back (spec 08 §4.4).
    const storage = deviceStorage();
    for (const [id, letter] of Object.entries(loadTrials(storage))) sounds.setTrial(id, letter);
    const showChoice = (): void => {
      choice.textContent = choiceText(sounds.trials());
    };
    showChoice();
    const action = (label: string, run: (b: HTMLButtonElement) => void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'debug-button debug-sound-tab';
      b.textContent = label;
      b.addEventListener('pointerup', (e) => {
        e.preventDefault();
        run(b);
      });
      actions.appendChild(b);
    };
    // SIMULAR COMBATE and SIMULAR RACHA, to hear the mix and the repair streak (spec 08 §8).
    action(STRINGS.debug.simulateCombat, () => sounds.simulateCombat());
    action(STRINGS.debug.simulateStreak, () => sounds.simulateStreak());
    action(STRINGS.debug.copyChoice, (b) => {
      void copyText(choiceText(sounds.trials())).then((ok) => {
        b.textContent = ok ? STRINGS.debug.copied : STRINGS.debug.copyFailed;
        window.setTimeout(() => (b.textContent = STRINGS.debug.copyChoice), 1500);
      });
    });
    action(STRINGS.debug.clearTrials, () => {
      for (const id of Object.keys(sounds.trials())) sounds.setTrial(id, null);
      saveTrials(storage, sounds.trials());
      showChoice();
      this.redrawSounds();
    });
    const families = [...new Set(sounds.sounds.map((s) => s.family))];
    let current = families[0];
    this.redrawSounds = () => {
      if (current) show(current);
    };
    const show = (family: SoundFamily): void => {
      current = family;
      for (const tab of tabs.children) tab.classList.toggle('is-on', (tab as HTMLElement).dataset.family === family);
      list.replaceChildren();
      for (const s of sounds.sounds) {
        if (s.family !== family) continue;
        // A cell per sound: its button (as in the game) and one per candidate, the one playing marked.
        const cell = document.createElement('div');
        cell.className = 'debug-sound-cell';
        const play = (label: string, run: () => void, extra = ''): HTMLButtonElement => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `debug-button ${extra}`.trim();
          b.textContent = label;
          b.addEventListener('pointerup', (e) => {
            e.preventDefault();
            run();
            this.refresh();
          });
          cell.appendChild(b);
          return b;
        };
        const pick = sounds.pickOf(s.id);
        play(pick?.pending ? `${s.id} ?` : s.id, () => sounds.test(s.id), 'debug-sound');
        for (const letter of sounds.candidatesOf(s.id)) {
          // It plays, and from now on the game plays it too (until another letter or BORRAR PRUEBAS).
          const b = play(letter, () => {
            sounds.setTrial(s.id, letter);
            saveTrials(storage, sounds.trials());
            sounds.testCandidate(s.id, letter);
            showChoice();
            show(family);
          }, 'debug-sound-candidate');
          b.classList.toggle('is-on', pick?.letter === letter);
        }
        list.appendChild(cell);
      }
    };
    for (const family of families) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'debug-button debug-sound-tab';
      tab.dataset.family = family;
      tab.textContent = STRINGS.debug.soundFamilies[family];
      tab.addEventListener('pointerup', (e) => {
        e.preventDefault();
        show(family);
      });
      tabs.appendChild(tab);
    }
    const first = families[0];
    if (first) show(first);
    return sheet;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.style.display = visible ? '' : 'none';
    if (!visible) this.setOpen(false);
    window.clearInterval(this.timer);
    if (visible) {
      this.refresh();
      this.timer = window.setInterval(() => this.refresh(), REFRESH_MS);
    }
  }

  private refresh(): void {
    const stats = this.readStats();
    const lines: string[] = [];
    for (const [label, value] of Object.entries(stats)) {
      lines.push(`${label}: ${typeof value === 'number' ? Math.round(value) : value}`);
    }
    this.statsEl.textContent = lines.join('\n');
    if (this.sounds && !this.soundSheet.hidden) {
      const s = this.sounds.stats();
      this.soundStatsEl.textContent = STRINGS.debug.soundStats(s.voices, s.dropped, s.lastDropped, s.state);
    }
  }
}

export function isDebugRequested(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

/** ?round=N (1..99), used to test later rounds before the wave flow exists. */
export function requestedStartRound(search: string = window.location.search): number {
  const n = Number.parseInt(new URLSearchParams(search).get('round') ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : 1;
}

/** ?map=<key> chooses the map from the manifest (default: the first one). */
export function requestedMap(search: string = window.location.search): string | null {
  const key = new URLSearchParams(search).get('map');
  return key && /^[a-z0-9_]+$/.test(key) ? key : null;
}

/** The browser's localStorage, or null where it is missing or blocked. */
function deviceStorage(): TrialStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Copies `text`: the clipboard API (it needs https), else a hidden text box. False when neither works. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok: boolean;
    try {
      // The only way on a phone over http (the local network): no clipboard API there.
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
