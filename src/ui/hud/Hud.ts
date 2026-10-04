import { BOSS, DOORS, HAND, ITEMS, MERCHANT, POINTS, WAVES, type BoostKind } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import { COLORS } from '../../config/theme';
import { UPGRADE_KINDS, WEAPONS, type UpgradeKind } from '../../config/weapons';

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
  /** "EL MAGO AZUL SE HA MOVIDO" or "¡VELOCIDAD!" under the round banner (spec 03 §2, §5). */
  private readonly notice: HTMLDivElement;
  /** The bosses' health bars under the pause button (spec 07 §6): one per boss slot, pooled. */
  private readonly bossBars: HTMLDivElement;
  private readonly bossRows: { row: HTMLDivElement; name: HTMLSpanElement; fill: HTMLDivElement }[] = [];
  private blinkTimer = 0;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly localPlayerId = 0,
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
    this.batteryFill = el('div', 'hud-battery__fill');
    battery.appendChild(this.batteryFill);
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
    right.append(pointsRow, this.money, this.floats);

    this.dead = el('div', 'hud-dead');
    this.dead.textContent = STRINGS.hud.dead;
    // "RONDA N" in the middle for a moment at the start of each round (spec 01 §4.8).
    this.banner = el('div', 'hud-banner');
    this.banner.style.animationDuration = `${WAVES.bannerDuration}s`;
    this.banner.addEventListener('animationend', () => this.banner.classList.remove('is-showing'));

    this.notice = el('div', 'hud-notice');
    this.notice.style.animationDuration = `${MERCHANT.movedNoticeTime}s`;
    this.notice.addEventListener('animationend', () => this.notice.classList.remove('is-showing'));

    // The bosses' bars: the name over a red bar with a mark at half, where its fury starts.
    this.bossBars = el('div', 'hud-bosses');
    for (let i = 0; i < BOSS.maxAlive; i++) {
      const row = el('div', 'hud-boss');
      const name = el('span', 'hud-boss__name');
      const bar = el('div', 'hud-boss__bar');
      const fill = el('div', 'hud-boss__fill');
      bar.append(fill, el('span', 'hud-boss__half'));
      row.append(name, bar);
      row.hidden = true;
      this.bossRows.push({ row, name, fill });
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

  private readonly onRound = (e: GameEvents['round:changed']): void => {
    const text = `${STRINGS.hud.round} ${e.round}`;
    this.round.textContent = text;
    this.banner.textContent = text;
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
      r.row.hidden = !bar;
      if (!bar) return;
      const name = STRINGS.bosses.names[bar.boss];
      r.name.textContent = name;
      r.row.setAttribute('aria-label', STRINGS.bosses.health(name));
      r.row.classList.toggle('is-enraged', bar.enraged);
      r.fill.style.transform = `scaleX(${bar.hp})`;
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
