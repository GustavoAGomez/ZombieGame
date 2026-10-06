import type { GameMode, RoomType } from '../../config/dungeon';
import { BOSS, DOORS, HAND, ITEMS, MERCHANT, POINTS, WAVES, type BoostKind } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import { COLORS } from '../../config/theme';
import type { Rarity } from '../../config/upgrades';
import { UPGRADE_KINDS, WEAPONS, type UpgradeKind } from '../../config/weapons';

/** The dungeon's minimap (spec 09 §4.2): a cell per room in CSS px, and the marks of the special rooms. */
const MINIMAP = { cell: 9, gap: 1, pad: 2 } as const;
const MINIMAP_MARKS: Partial<Record<RoomType, string>> = { treasure: COLORS.amber, hand: COLORS.redLow, challenge: COLORS.red, boss: COLORS.red, elite: COLORS.amberDark };
/** Enemy rooms cleared between two wizards (spec 09 §7.1). */
const MERCHANT_EVERY = 5;
/** The rarities' colours (spec 09 §7.1), the wizards' own. */
const RARITY_COLORS: Record<Rarity, string> = { common: COLORS.merchantBlue, rare: COLORS.red, legendary: COLORS.amber };

/** Colour of each boost's notice: amber like the speed bolt, light blue like the double damage bullets. */
const BOOST_COLORS: Record<BoostKind, string> = { speed: COLORS.amber, double_damage: COLORS.boostDamage };
import type { EventBus, GameEvents } from '../../core/EventBus';
import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
import { HurtVignette } from './HurtVignette';
import './hud.css';

const HEALTH_SEGMENTS = 10;
/** The weapon's upgrade marks: an icon per kind (ammo, fire rate, damage). */
const MARK_ICONS: Record<UpgradeKind, 'mark_ammo' | 'mark_rate' | 'mark_damage'> = { ammo: 'mark_ammo', fire_rate: 'mark_rate', damage: 'mark_damage' };
/** Floating "+N" texts alive at once; the oldest is reused when all are busy. */
const FLOAT_POOL_SIZE = 8;

/**
 * DOM HUD. It only listens to EventBus payloads and never imports or
 * queries Phaser (CLAUDE.md rule 4). The DOM is touched only on events,
 * which are emitted only when a value changes.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly healthRow: HTMLDivElement;
  private readonly segments: HTMLDivElement[] = [];
  private readonly round: HTMLDivElement;
  private readonly points: HTMLSpanElement;
  private readonly money: HTMLSpanElement;
  private readonly weaponRow: HTMLDivElement;
  private readonly weaponName: HTMLSpanElement;
  /** The weapon's upgrade marks: per kind, its icon and a box per level, filled when bought. */
  private readonly marks: HTMLSpanElement;
  private shownLevels = '';
  /** The laser's overheat marks last drawn, as "left/total". */
  private shownOverheats = '';
  private readonly magazine: HTMLSpanElement;
  private readonly reloadFill: HTMLDivElement;
  /** A beam weapon's battery instead of the ammo (spec 06 §2.1). */
  private readonly batteryFill: HTMLDivElement;
  private readonly overheatMarks: HTMLSpanElement;
  private readonly reserve: HTMLSpanElement;
  private readonly floats: HTMLDivElement;
  private readonly floatPool: HTMLSpanElement[] = [];
  private nextFloat = 0;
  /** Red frame around the screen: health left and the blink of each hit. */
  private readonly hurt = new HurtVignette();
  private readonly dead: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly bannerTitle: HTMLSpanElement;
  /** «ALGO GRANDE SE ACERCA» under the round in a boss round (spec 07 §6). */
  private readonly bannerSub: HTMLSpanElement;
  /** "EL MAGO AZUL SE HA MOVIDO" or "¡VELOCIDAD!" under the round banner (spec 03 §2, §5). */
  private readonly notice: HTMLDivElement;
  /** The bosses' health bars at the top centre (spec 07 §6): one per boss slot, pooled. */
  private readonly bossBars: HTMLDivElement;
  private readonly bossRows: { row: HTMLDivElement; name: HTMLSpanElement; fill: HTMLDivElement; ghost: HTMLDivElement }[] = [];
  private blinkTimer = 0;
  private readonly unsubscribers: (() => void)[] = [];
  /** The dungeon's minimap and the wizard's counter (spec 09 §4.2), and what they draw. */
  private readonly minimap: HTMLCanvasElement;
  private readonly counter: HTMLDivElement;
  /** The keys in hand (spec 09 §4.2), under the money. */
  private readonly keys: HTMLSpanElement;
  private plan: GameEvents['dungeon:floor'] | null = null;
  private rooms: GameEvents['dungeon:rooms'] | null = null;

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly localPlayerId = 0,
    /** The dungeon (spec 09 §4.2) shows its minimap and the wizard's counter where Survival shows the points. */
    mode: GameMode = 'survival',
  ) {
    this.root = el('div', 'hud');

    // Top-left: health row, round, the weapon in hand, and a reserved row for stats.
    const left = el('div', 'hud-left');
    this.healthRow = el('div', 'hud-row hud-health');
    this.healthRow.setAttribute('aria-label', STRINGS.hud.health);
    const heart = pixelIcon('heart', 14);
    heart.classList.add('hud-heart');
    const bar = el('div', 'hud-bar');
    // The skin's frame brings its own heart (hud.css hides this copy without it): it beats below 30.
    bar.appendChild(el('span', 'hud-bar__heart'));
    for (let i = 0; i < HEALTH_SEGMENTS; i++) {
      const seg = el('div', 'hud-bar__seg');
      this.segments.push(seg);
      bar.appendChild(seg);
    }
    // No number: the bar says it (and the label, for screen readers).
    this.healthRow.append(heart, bar);
    this.round = el('div', 'hud-round');
    // The weapon in hand: its name and upgrade marks, and the ammo on the line below.
    this.weaponRow = el('div', 'hud-weapon');
    this.weaponName = el('span', 'hud-label hud-weapon__name');
    this.marks = el('span', 'hud-marks');
    this.magazine = el('span', 'hud-mag');
    const reload = el('div', 'hud-reload');
    reload.setAttribute('aria-label', STRINGS.hud.reloading);
    this.reloadFill = el('div', 'hud-reload__fill');
    reload.appendChild(this.reloadFill);
    this.reserve = el('span', 'hud-reserve');
    const nameRow = el('div', 'hud-row hud-weapon__head');
    nameRow.append(this.weaponName, this.marks);
    const ammoRow = el('div', 'hud-row hud-ammo');
    // A weapon without ammo (the katana) shows ∞ instead of the bullet and the numbers.
    const bullet = pixelIcon('bullet', 12);
    bullet.classList.add('hud-ammo__bullet');
    const infinite = pixelIcon('infinity', 18);
    infinite.classList.add('hud-ammo__infinite');
    // A beam weapon (the laser) shows its battery instead, blinking red with SOBRECALENTADO once overheated.
    const battery = el('div', 'hud-battery');
    battery.setAttribute('aria-label', STRINGS.hud.battery);
    // The fill goes in the trough: the gauge frame's hollow with the skin, the whole bar without it.
    const batteryTrough = el('div', 'hud-battery__trough');
    this.batteryFill = el('div', 'hud-battery__fill');
    batteryTrough.appendChild(this.batteryFill);
    battery.appendChild(batteryTrough);
    const overheated = el('span', 'hud-battery__label');
    overheated.textContent = STRINGS.hud.overheated;
    // Its overheats left before it breaks for good: a box each under the bar, lit while still to come.
    this.overheatMarks = el('span', 'hud-mark hud-overheats');
    const batteryBox = el('div', 'hud-battery-box');
    batteryBox.append(battery, this.overheatMarks);
    // A weapon that wears out (the katana) shows its uses left in place of the ∞, and ROTA once out of them.
    const broken = el('span', 'hud-broken');
    broken.textContent = STRINGS.hud.broken;
    ammoRow.append(bullet, infinite, this.magazine, batteryBox, overheated, broken, reload, this.reserve);
    this.weaponRow.append(nameRow, ammoRow);
    // An empty row kept for future stats and perks (spec 01 §5).
    left.append(this.healthRow, this.round, this.weaponRow, el('div', 'hud-reserved'));

    // Top-right: the points (everything earned), the money to spend in green, and the floating "+N$"
    // under them. The weapon slots hang right under it and the special items sit to its left (controls.css).
    const right = el('div', 'hud-right');
    const pointsRow = el('div', 'hud-row hud-points');
    const pointsLabel = el('span', 'hud-label');
    pointsLabel.textContent = STRINGS.hud.points;
    this.points = el('span', 'hud-points__value');
    pointsRow.append(pointsLabel, this.points);
    this.money = el('span', 'hud-money');
    // Floating "+N$" texts, pooled (CLAUDE.md rule 7), drawn under the money (hud.css).
    this.floats = el('div', 'hud-floats');
    for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
      const span = el('span', 'hud-float');
      span.style.animationDuration = `${POINTS.floatingTextMs}ms`;
      span.addEventListener('animationend', () => span.classList.remove('is-active'));
      this.floatPool.push(span);
      this.floats.appendChild(span);
    }
    // The dungeon (spec 09 §4.2): the minimap, a cell per room, and the five marks towards the wizard, in place of the points.
    this.minimap = el('canvas', 'hud-minimap');
    this.minimap.setAttribute('aria-label', STRINGS.dungeon.minimap);
    this.counter = el('div', 'hud-mark hud-counter');
    this.counter.setAttribute('aria-label', STRINGS.dungeon.counter);
    for (let i = 0; i < MERCHANT_EVERY; i++) this.counter.appendChild(el('span', 'hud-mark__box'));
    this.keys = el('span', 'hud-keys');
    if (mode === 'dungeon') {
      pointsRow.hidden = true;
      right.append(this.minimap, this.counter);
    }
    right.append(pointsRow, this.money, this.keys, this.floats);

    this.dead = el('div', 'hud-dead');
    this.dead.textContent = STRINGS.hud.dead;
    // "RONDA N" in the middle for a moment at the start of each round (spec 01 §4.8).
    this.banner = el('div', 'hud-banner');
    this.bannerTitle = el('span', 'hud-banner__title');
    this.bannerSub = el('span', 'hud-banner__sub');
    this.bannerSub.textContent = STRINGS.bosses.incoming;
    this.banner.append(this.bannerTitle, this.bannerSub);
    this.banner.style.animationDuration = `${WAVES.bannerDuration}s`;
    this.banner.addEventListener('animationend', () => this.banner.classList.remove('is-showing'));

    this.notice = el('div', 'hud-notice');
    this.notice.style.animationDuration = `${MERCHANT.movedNoticeTime}s`;
    this.notice.addEventListener('animationend', () => this.notice.classList.remove('is-showing'));

    // The bosses' bars: the name over a red bar with a mark at half, where its fury starts. In its
    // trough, behind the fill, a pale strip empties a moment after each blow: the damage just done.
    this.bossBars = el('div', 'hud-bosses');
    for (let i = 0; i < BOSS.maxAlive; i++) {
      const row = el('div', 'hud-boss');
      const name = el('span', 'hud-boss__name');
      const bar = el('div', 'hud-boss__bar');
      const trough = el('div', 'hud-boss__trough');
      const ghost = el('div', 'hud-boss__ghost');
      const fill = el('div', 'hud-boss__fill');
      trough.append(ghost, fill, el('span', 'hud-boss__half'));
      bar.append(trough);
      row.append(name, bar);
      row.hidden = true;
      this.bossRows.push({ row, name, fill, ghost });
      this.bossBars.appendChild(row);
    }

    this.root.append(this.hurt.root, left, right, this.bossBars, this.banner, this.notice, this.dead);
    parent.appendChild(this.root);

    this.unsubscribers.push(
      events.on('player:health', this.onHealth),
      events.on('points:changed', this.onPoints),
      events.on('points:gained', this.onPointsGained),
      events.on('money:spent', this.onMoneySpent),
      events.on('round:changed', this.onRound),
      events.on('dungeon:floor', this.onFloor),
      events.on('dungeon:rooms', this.onRooms),
      events.on('dungeon:wizard', this.onWizard),
      events.on('dungeon:upgrade', this.onUpgrade),
      events.on('weapon:state', this.onWeapon),
      events.on('player:damaged', this.onDamaged),
      events.on('player:died', this.onDied),
      events.on('merchant:moved', this.onMerchantMoved),
      events.on('boost:activated', this.onBoostActivated),
      events.on('item:picked', this.onItemPicked),
      events.on('activation:completed', this.onActivationCompleted),
      events.on('zone:unlocked', this.onZoneUnlocked),
      events.on('hand:offer', this.onHandOffer),
      events.on('hand:moved', this.onHandMoved),
      events.on('hand:refunded', this.onHandRefunded),
      events.on('weapon:broken', this.onWeaponBroken),
      events.on('boss:bars', this.onBossBars),
      events.on('shop:state', this.onShop),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.hurt.destroy();
    window.clearTimeout(this.blinkTimer);
    this.root.remove();
  }

  private readonly onHealth = (e: GameEvents['player:health']): void => {
    const filled = Math.ceil((e.hp / e.maxHp) * HEALTH_SEGMENTS);
    for (let i = 0; i < this.segments.length; i++) this.segments[i]?.classList.toggle('is-full', i < filled);
    this.healthRow.setAttribute('aria-label', `${STRINGS.hud.health}: ${e.hp}`);
    this.healthRow.classList.toggle('is-low', e.low);
    this.hurt.setHealth(e.hp, e.maxHp);
  };

  private readonly onPoints = (e: GameEvents['points:changed']): void => {
    this.points.textContent = String(e.points);
    this.money.textContent = STRINGS.hud.money(e.money);
  };

  private readonly onPointsGained = (e: GameEvents['points:gained']): void => {
    // Gains with a world position (repaired windows) float in the world instead.
    if (e.playerId !== this.localPlayerId || e.x !== undefined) return;
    this.float(STRINGS.hud.moneyGained(e.amount), false);
  };

  /** "-750$" in red when something is bought from a merchant (spec 03 §3). */
  private readonly onMoneySpent = (e: GameEvents['money:spent']): void => {
    if (e.playerId === this.localPlayerId) this.float(STRINGS.hud.moneySpent(e.amount), true);
  };

  private float(text: string, spent: boolean): void {
    const span = this.floatPool[this.nextFloat];
    if (!span) return;
    this.nextFloat = (this.nextFloat + 1) % this.floatPool.length;
    span.textContent = text;
    span.classList.toggle('hud-float--spent', spent);
    // Newest at the bottom of the stack; restart its rise-and-fade animation.
    this.floats.appendChild(span);
    span.classList.remove('is-active');
    void span.offsetWidth;
    span.classList.add('is-active');
  }

  /** A dungeon floor begins (spec 09 §2): «PLANTA 1 · MANSIÓN» as the round's banner, the floor in the round's place. */
  private readonly onFloor = (e: GameEvents['dungeon:floor']): void => {
    this.plan = e;
    this.rooms = null;
    const cell = MINIMAP.cell + MINIMAP.gap;
    this.minimap.width = e.width * cell - MINIMAP.gap + 2 * MINIMAP.pad;
    this.minimap.height = e.height * cell - MINIMAP.gap + 2 * MINIMAP.pad;
    this.minimap.style.width = `${this.minimap.width}px`;
    this.minimap.style.height = `${this.minimap.height}px`;
    this.round.textContent = STRINGS.dungeon.floor(e.floor);
    this.showBanner(STRINGS.dungeon.floorBanner(e.floor, STRINGS.dungeon.ambients[e.ambient] ?? e.ambient.toUpperCase()), false);
    this.drawMinimap();
  };

  private readonly onRooms = (e: GameEvents['dungeon:rooms']): void => {
    this.rooms = e;
    const parts: string[] = [];
    if (e.keys > 0) parts.push(STRINGS.dungeon.keys(e.keys));
    if (e.bossKey) parts.push(STRINGS.dungeon.bossKey);
    this.keys.textContent = parts.join(' · ');
    this.keys.classList.toggle('is-boss', e.bossKey);
    const boxes = this.counter.children;
    const lit = e.counter % MERCHANT_EVERY;
    for (let i = 0; i < boxes.length; i++) boxes[i]?.classList.toggle('is-on', i < lit);
    this.drawMinimap();
  };

  /**
   * The minimap (spec 09 §4.2): the rooms visited and their neighbours, a
   * square per cell (the arena, four), the current one framed in amber and
   * each special room with its colour.
   */
  private drawMinimap(): void {
    const plan = this.plan;
    const g = this.minimap.getContext('2d');
    if (!plan || !g) return;
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    // A dark sheet behind, so the map reads over any floor.
    g.fillStyle = COLORS.ink;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, this.minimap.width, this.minimap.height);
    g.globalAlpha = 1;
    const rooms = this.rooms;
    const visited = (i: number): boolean => rooms?.visited[i] === true;
    const step = MINIMAP.cell + MINIMAP.gap;
    const at = (c: number): number => MINIMAP.pad + c * step;
    plan.rooms.forEach((room, i) => {
      const shown = visited(i) || room.neighbours.some(visited);
      if (!shown) return;
      const xs = room.cells.map((c) => c.x);
      const ys = room.cells.map((c) => c.y);
      const x = at(Math.min(...xs));
      const y = at(Math.min(...ys));
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * step - MINIMAP.gap;
      const h = (Math.max(...ys) - Math.min(...ys) + 1) * step - MINIMAP.gap;
      // Visited rooms solid; the ones only glimpsed through a door, dark.
      g.fillStyle = visited(i) ? (rooms?.cleared[i] || room.type === 'start' || room.type === 'treasure' || room.type === 'hand' ? COLORS.muted : COLORS.dim) : COLORS.wall;
      g.fillRect(x, y, w, h);
      const mark = MINIMAP_MARKS[room.type];
      if (mark) {
        g.fillStyle = mark;
        g.fillRect(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 3, 3);
      }
      // The wizard waiting in a room (spec 09 §7.1): a blue dot in its corner.
      if (rooms?.wizardRoom === i) {
        g.fillStyle = COLORS.merchantBlue;
        g.fillRect(x + 1, y + 1, 3, 3);
      }
      if (rooms?.current === i) {
        g.strokeStyle = COLORS.amber;
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    });
  }

  /** The wizard appeared (spec 09 §7.1): said in its colour. */
  private readonly onWizard = (e: GameEvents['dungeon:wizard']): void => {
    this.showNotice(STRINGS.dungeon.wizardHere, merchantDef(e.merchant).color);
  };

  /** An upgrade taken (spec 09 §7.1, §7.3): its name, in its rarity's colour. */
  private readonly onUpgrade = (e: GameEvents['dungeon:upgrade']): void => {
    if (e.playerId !== this.localPlayerId) return;
    this.showNotice(STRINGS.upgrades.names[e.id] ?? e.id, RARITY_COLORS[e.rarity]);
  };

  private readonly onRound = (e: GameEvents['round:changed']): void => {
    const text = `${STRINGS.hud.round} ${e.round}`;
    this.round.textContent = text;
    this.showBanner(text, e.boss);
  };

  /** The middle banner, restarted, with the HUD's round figure blinking while it shows. */
  private showBanner(text: string, boss: boolean): void {
    this.bannerTitle.textContent = text;
    this.bannerSub.hidden = !boss;
    // Restart the banner and make the HUD figure blink for as long as it shows.
    this.banner.classList.remove('is-showing');
    void this.banner.offsetWidth;
    this.banner.classList.add('is-showing');
    this.round.classList.add('is-blinking');
    window.clearTimeout(this.blinkTimer);
    this.blinkTimer = window.setTimeout(() => this.round.classList.remove('is-blinking'), WAVES.bannerDuration * 1000);
  };

  private readonly onMerchantMoved = (e: GameEvents['merchant:moved']): void => {
    // Its first appearance is announced by the smoke alone.
    if (e.first) return;
    this.showNotice(STRINGS.merchants.moved(STRINGS.merchants.names[e.merchant]), merchantDef(e.merchant).color);
  };

  /** A boost started: said out loud, so a tap by mistake does not go unnoticed. */
  private readonly onBoostActivated = (e: GameEvents['boost:activated']): void => {
    if (e.playerId === this.localPlayerId) this.showNotice(STRINGS.boosts.activated(STRINGS.boosts.names[e.boost]), BOOST_COLORS[e.boost]);
  };

  /** A special item picked up: its name for a moment (spec 05 §3). */
  private readonly onItemPicked = (e: GameEvents['item:picked']): void => {
    if (e.playerId === this.localPlayerId) this.showNotice(STRINGS.items.names[e.item], 'var(--bone)', ITEMS.pickupNoticeTime);
  };

  /** An activation done (spec 05 §6): for everyone, in the summoned merchant's colour. */
  private readonly onActivationCompleted = (e: GameEvents['activation:completed']): void => {
    if (e.effect.kind !== 'summon_merchant') return;
    const merchant = e.effect.merchant;
    this.showNotice(STRINGS.merchants.summoned(STRINGS.merchants.names[merchant]), merchantDef(merchant).color, ITEMS.summonNoticeTime);
  };

  /** The Demon's Hand opened with a special weapon (spec 06 §3.4): its name, for a moment. */
  private readonly onHandOffer = (e: GameEvents['hand:offer']): void => {
    if (e.special) this.showNotice(STRINGS.weapons[e.weapon], 'var(--red)', HAND.specialNoticeTime);
  };

  /** The tired hand came up elsewhere (spec 06 §3.6), for everyone. */
  private readonly onHandMoved = (): void => {
    this.showNotice(STRINGS.hand.moved, 'var(--red)', HAND.movedNoticeTime);
  };

  /** One of this player's weapons broke: the katana out of uses, the laser at its last overheat. */
  private readonly onWeaponBroken = (e: GameEvents['weapon:broken']): void => {
    if (e.playerId !== this.localPlayerId) return;
    this.showNotice(STRINGS.weaponBroken[e.weapon] ?? STRINGS.weapons[e.weapon], 'var(--red)', HAND.movedNoticeTime);
  };

  /** The tired hand gave the payment back: "+950$" (the blood pact's health shows on the bar). */
  private readonly onHandRefunded = (e: GameEvents['hand:refunded']): void => {
    if (e.playerId === this.localPlayerId && !e.blood) this.float(STRINGS.hud.moneyGained(e.amount), false);
  };

  /** A room unlocked: only now is it told which one, for everyone. */
  private readonly onZoneUnlocked = (e: GameEvents['zone:unlocked']): void => {
    this.showNotice(STRINGS.zoneUnlocked(e.zone), 'var(--bone)', DOORS.unlockedNoticeTime);
  };

  private showNotice(text: string, color: string, seconds: number = MERCHANT.movedNoticeTime): void {
    this.notice.textContent = text;
    this.notice.style.color = color;
    this.notice.style.animationDuration = `${seconds}s`;
    this.notice.classList.remove('is-showing');
    void this.notice.offsetWidth;
    this.notice.classList.add('is-showing');
  }

  private readonly onWeapon = (e: GameEvents['weapon:state']): void => {
    this.weaponName.textContent = STRINGS.weapons[e.weapon];
    // With its special the weapon's name turns amber.
    this.weaponName.classList.toggle('is-special', e.special);
    const levelsKey = UPGRADE_KINDS.map((k) => `${e.levels[k]}/${e.maxLevels[k]}`).join(' ');
    if (levelsKey !== this.shownLevels) {
      this.shownLevels = levelsKey;
      this.marks.replaceChildren(
        ...UPGRADE_KINDS.filter((k) => e.maxLevels[k] > 0).map((k) => {
          const mark = el('span', 'hud-mark');
          mark.append(pixelIcon(MARK_ICONS[k], 7), ...Array.from({ length: e.maxLevels[k] }, (_, i) => el('span', i < e.levels[k] ? 'hud-mark__box is-on' : 'hud-mark__box')));
          return mark;
        }),
      );
    }
    this.weaponRow.classList.toggle('is-infinite', e.ammo === 'none');
    this.weaponRow.classList.toggle('has-uses', e.uses !== null);
    this.weaponRow.classList.toggle('is-broken', e.uses === 0);
    const total = WEAPONS[e.weapon].battery?.breaksAfter ?? 0;
    const overheatsKey = e.overheatsLeft === null ? '' : `${e.overheatsLeft}/${total}`;
    if (overheatsKey !== this.shownOverheats) {
      this.shownOverheats = overheatsKey;
      const left = e.overheatsLeft ?? 0;
      this.overheatMarks.replaceChildren(...Array.from({ length: e.overheatsLeft === null ? 0 : total }, (_, i) => el('span', i < left ? 'hud-mark__box is-on' : 'hud-mark__box')));
      this.overheatMarks.setAttribute('aria-label', STRINGS.hud.overheatsLeft(left));
    }
    this.weaponRow.classList.toggle('is-battery', e.ammo === 'battery');
    this.weaponRow.classList.toggle('is-overheated', e.overheated);
    // The katana's cooldown fills the same bar back up, in place of the ∞, until it can sweep again.
    this.weaponRow.classList.toggle('is-recharging', e.cooldown > 0);
    this.batteryFill.style.transform = `scaleX(${e.cooldown > 0 ? 1 - e.cooldown : e.battery})`;
    this.magazine.textContent = String(e.uses ?? e.magazine);
    if (e.uses !== null) this.magazine.setAttribute('aria-label', STRINGS.hud.usesLeft(e.uses));
    else this.magazine.removeAttribute('aria-label');
    this.reserve.textContent = `/ ${e.reserve}`;
    const reloading = e.reloadProgress !== null;
    this.weaponRow.classList.toggle('is-reloading', reloading);
    this.weaponRow.classList.toggle('is-switching', e.switching);
    if (reloading) this.reloadFill.style.transform = `scaleX(${e.reloadProgress})`;
  };

  /** The bosses' health bars: one row per boss shown, stacked. */
  private readonly onBossBars = (e: GameEvents['boss:bars']): void => {
    this.bossRows.forEach((r, i) => {
      const bar = e.bars[i];
      const appearing = r.row.hidden && bar !== undefined;
      r.row.hidden = !bar;
      if (!bar) return;
      const name = STRINGS.bosses.names[bar.boss];
      r.name.textContent = name;
      r.row.setAttribute('aria-label', STRINGS.bosses.health(name));
      r.row.classList.toggle('is-enraged', bar.enraged);
      r.fill.style.transform = `scaleX(${bar.hp})`;
      // A boss just shown starts with its strip full, not emptying from the last one's.
      if (appearing) {
        r.ghost.style.transition = 'none';
        r.ghost.style.transform = `scaleX(${bar.hp})`;
        void r.ghost.offsetWidth;
        r.ghost.style.transition = '';
      } else r.ghost.style.transform = `scaleX(${bar.hp})`;
    });
  };

  /** With a shop open the bars step aside: the merchant shows right above the panel, where they are. */
  private readonly onShop = (e: GameEvents['shop:state']): void => {
    this.bossBars.classList.toggle('is-hidden', e.merchant !== null);
  };

  private readonly onDamaged = (e: GameEvents['player:damaged']): void => {
    if (e.playerId === this.localPlayerId) this.hurt.flash();
  };

  private readonly onDied = (): void => {
    this.dead.classList.add('is-visible');
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
