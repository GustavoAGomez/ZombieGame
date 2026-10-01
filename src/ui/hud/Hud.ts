import { MERCHANT, PLAYER, POINTS, WAVES } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import type { EventBus, GameEvents } from '../../core/EventBus';
import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
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
  private readonly weaponRow: HTMLDivElement;
  private readonly weaponName: HTMLSpanElement;
  private readonly magazine: HTMLSpanElement;
  private readonly reloadFill: HTMLDivElement;
  private readonly reserve: HTMLSpanElement;
  private readonly floats: HTMLDivElement;
  private readonly floatPool: HTMLSpanElement[] = [];
  private nextFloat = 0;
  private readonly damage: HTMLDivElement;
  private readonly dead: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  /** "EL MAGO AZUL SE HA MOVIDO" under the round banner (spec 03 §2). */
  private readonly notice: HTMLDivElement;
  private damageTimer = 0;
  private blinkTimer = 0;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly localPlayerId = 0,
  ) {
    this.root = el('div', 'hud');

    // Top-left: health row, round, and (later) a reserved row for stats.
    const left = el('div', 'hud-left');
    this.healthRow = el('div', 'hud-row hud-health');
    this.healthRow.setAttribute('aria-label', STRINGS.hud.health);
    const heart = pixelIcon('heart', 21);
    heart.classList.add('hud-heart');
    const bar = el('div', 'hud-bar');
    for (let i = 0; i < HEALTH_SEGMENTS; i++) {
      const seg = el('div', 'hud-bar__seg');
      this.segments.push(seg);
      bar.appendChild(seg);
    }
    this.hpValue = el('span', 'hud-hp');
    this.healthRow.append(heart, bar, this.hpValue);
    this.round = el('div', 'hud-round');
    // An empty row kept for future stats (spec 01 §5).
    left.append(this.healthRow, this.round, el('div', 'hud-reserved'));

    // Top-right: points row, weapon row, the floating "+N" beside the points, a reserved row.
    const right = el('div', 'hud-right');
    const pointsRow = el('div', 'hud-row hud-points');
    const pointsLabel = el('span', 'hud-label');
    pointsLabel.textContent = STRINGS.hud.points;
    this.points = el('span', 'hud-points__value');
    pointsRow.append(pointsLabel, this.points);
    this.weaponRow = el('div', 'hud-row hud-weapon');
    this.weaponName = el('span', 'hud-label');
    this.magazine = el('span', 'hud-mag');
    const reload = el('div', 'hud-reload');
    reload.setAttribute('aria-label', STRINGS.hud.reloading);
    this.reloadFill = el('div', 'hud-reload__fill');
    reload.appendChild(this.reloadFill);
    this.reserve = el('span', 'hud-reserve');
    this.weaponRow.append(this.weaponName, pixelIcon('bullet', 21), this.magazine, reload, this.reserve);
    // Floating "+N" texts, pooled (CLAUDE.md rule 7), drawn to the left of the points (hud.css).
    this.floats = el('div', 'hud-floats');
    for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
      const span = el('span', 'hud-float');
      span.style.animationDuration = `${POINTS.floatingTextMs}ms`;
      span.addEventListener('animationend', () => span.classList.remove('is-active'));
      this.floatPool.push(span);
      this.floats.appendChild(span);
    }
    // An empty row kept for future perks (spec 01 §5), under the floating texts.
    right.append(pointsRow, this.weaponRow, this.floats, el('div', 'hud-reserved'));

    this.damage = el('div', 'hud-damage');
    this.dead = el('div', 'hud-dead');
    this.dead.textContent = STRINGS.hud.dead;
    // "RONDA N" in the middle for a moment at the start of each round (spec 01 §4.8).
    this.banner = el('div', 'hud-banner');
    this.banner.style.animationDuration = `${WAVES.bannerDuration}s`;
    this.banner.addEventListener('animationend', () => this.banner.classList.remove('is-showing'));

    this.notice = el('div', 'hud-notice');
    this.notice.style.animationDuration = `${MERCHANT.movedNoticeTime}s`;
    this.notice.addEventListener('animationend', () => this.notice.classList.remove('is-showing'));

    this.root.append(this.damage, left, right, this.banner, this.notice, this.dead);
    parent.appendChild(this.root);

    this.unsubscribers.push(
      events.on('player:health', this.onHealth),
      events.on('points:changed', this.onPoints),
      events.on('points:gained', this.onPointsGained),
      events.on('points:spent', this.onPointsSpent),
      events.on('round:changed', this.onRound),
      events.on('weapon:state', this.onWeapon),
      events.on('player:damaged', this.onDamaged),
      events.on('player:died', this.onDied),
      events.on('merchant:moved', this.onMerchantMoved),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    window.clearTimeout(this.damageTimer);
    window.clearTimeout(this.blinkTimer);
    this.root.remove();
  }

  private readonly onHealth = (e: GameEvents['player:health']): void => {
    const filled = Math.ceil((e.hp / e.maxHp) * HEALTH_SEGMENTS);
    for (let i = 0; i < this.segments.length; i++) this.segments[i]?.classList.toggle('is-full', i < filled);
    this.hpValue.textContent = String(e.hp);
    this.healthRow.classList.toggle('is-low', e.low);
  };

  private readonly onPoints = (e: GameEvents['points:changed']): void => {
    this.points.textContent = String(e.points);
  };

  private readonly onPointsGained = (e: GameEvents['points:gained']): void => {
    // Gains with a world position (repaired windows) float in the world instead.
    if (e.playerId !== this.localPlayerId || e.x !== undefined) return;
    this.float(`+${e.amount}`, false);
  };

  /** "-750" in red when something is bought from a merchant (spec 03 §3). */
  private readonly onPointsSpent = (e: GameEvents['points:spent']): void => {
    if (e.playerId === this.localPlayerId) this.float(`-${e.amount}`, true);
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
    this.notice.textContent = STRINGS.merchants.moved(STRINGS.merchants.names[e.merchant]);
    this.notice.style.color = merchantDef(e.merchant).color;
    this.notice.classList.remove('is-showing');
    void this.notice.offsetWidth;
    this.notice.classList.add('is-showing');
  };

  private readonly onWeapon = (e: GameEvents['weapon:state']): void => {
    this.weaponName.textContent = STRINGS.weapons[e.weapon];
    this.magazine.textContent = String(e.magazine);
    this.reserve.textContent = `/ ${e.reserve}`;
    const reloading = e.reloadProgress !== null;
    this.weaponRow.classList.toggle('is-reloading', reloading);
    this.weaponRow.classList.toggle('is-switching', e.switching);
    if (reloading) this.reloadFill.style.transform = `scaleX(${e.reloadProgress})`;
  };

  private readonly onDamaged = (): void => {
    this.damage.classList.add('is-visible');
    window.clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => this.damage.classList.remove('is-visible'), PLAYER.hitFlashDuration * 1000);
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
