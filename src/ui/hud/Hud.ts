import { MERCHANT, POINTS, WAVES, type BoostKind } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import { COLORS } from '../../config/theme';

/** Colour of each boost's notice: amber like the speed bolt, light blue like the double damage bullets. */
const BOOST_COLORS: Record<BoostKind, string> = { speed: COLORS.amber, double_damage: COLORS.boostDamage };
import type { EventBus, GameEvents } from '../../core/EventBus';
import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
import { HurtVignette } from './HurtVignette';
import './hud.css';

const HEALTH_SEGMENTS = 10;
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
  private readonly hpValue: HTMLSpanElement;
  private readonly round: HTMLDivElement;
  private readonly points: HTMLSpanElement;
  private readonly money: HTMLSpanElement;
  private readonly weaponRow: HTMLDivElement;
  private readonly weaponName: HTMLSpanElement;
  /** One star per upgrade level, next to the weapon's name (spec 03 §6). */
  private readonly stars: HTMLSpanElement;
  private shownLevel = -1;
  private readonly magazine: HTMLSpanElement;
  private readonly reloadFill: HTMLDivElement;
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
    this.hpValue = el('span', 'hud-hp');
    this.healthRow.append(heart, bar, this.hpValue);
    this.round = el('div', 'hud-round');
    this.weaponRow = el('div', 'hud-row hud-weapon');
    this.weaponName = el('span', 'hud-label hud-weapon__name');
    this.stars = el('span', 'hud-stars');
    this.magazine = el('span', 'hud-mag');
    const reload = el('div', 'hud-reload');
    reload.setAttribute('aria-label', STRINGS.hud.reloading);
    this.reloadFill = el('div', 'hud-reload__fill');
    reload.appendChild(this.reloadFill);
    this.reserve = el('span', 'hud-reserve');
    this.weaponRow.append(this.weaponName, this.stars, pixelIcon('bullet', 12), this.magazine, reload, this.reserve);
    // An empty row kept for future stats and perks (spec 01 §5).
    left.append(this.healthRow, this.round, this.weaponRow, el('div', 'hud-reserved'));

    // Top-right: the points (everything earned), the money to spend in green, and the floating "+N$"
    // beside the points. The weapon slots hang right under it (controls.css).
    const right = el('div', 'hud-right');
    const pointsRow = el('div', 'hud-row hud-points');
    const pointsLabel = el('span', 'hud-label');
    pointsLabel.textContent = STRINGS.hud.points;
    this.points = el('span', 'hud-points__value');
    pointsRow.append(pointsLabel, this.points);
    this.money = el('span', 'hud-money');
    // Floating "+N$" texts, pooled (CLAUDE.md rule 7), drawn to the left of the points (hud.css).
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

    this.root.append(this.hurt.root, left, right, this.banner, this.notice, this.dead);
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
    this.hpValue.textContent = String(e.hp);
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

  private showNotice(text: string, color: string): void {
    this.notice.textContent = text;
    this.notice.style.color = color;
    this.notice.classList.remove('is-showing');
    void this.notice.offsetWidth;
    this.notice.classList.add('is-showing');
  }

  private readonly onWeapon = (e: GameEvents['weapon:state']): void => {
    this.weaponName.textContent = STRINGS.weapons[e.weapon];
    // With its special the weapon's name turns amber.
    this.weaponName.classList.toggle('is-special', e.special);
    if (e.level !== this.shownLevel) {
      this.shownLevel = e.level;
      this.stars.replaceChildren(...Array.from({ length: e.level }, () => pixelIcon('star', 7)));
    }
    this.magazine.textContent = String(e.magazine);
    this.reserve.textContent = `/ ${e.reserve}`;
    const reloading = e.reloadProgress !== null;
    this.weaponRow.classList.toggle('is-reloading', reloading);
    this.weaponRow.classList.toggle('is-switching', e.switching);
    if (reloading) this.reloadFill.style.transform = `scaleX(${e.reloadProgress})`;
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
