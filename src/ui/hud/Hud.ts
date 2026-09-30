import { PLAYER, POINTS } from '../../config/balance';
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
  private damageTimer = 0;
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
    left.append(this.healthRow, this.round);

    // Top-right: points row, weapon row (floating texts come in phase 6).
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
    // Row 3: stack of floating "+N" texts, pooled (CLAUDE.md rule 7).
    this.floats = el('div', 'hud-floats');
    for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
      const span = el('span', 'hud-float');
      span.style.animationDuration = `${POINTS.floatingTextMs}ms`;
      span.addEventListener('animationend', () => span.classList.remove('is-active'));
      this.floatPool.push(span);
      this.floats.appendChild(span);
    }
    right.append(pointsRow, this.weaponRow, this.floats);

    this.damage = el('div', 'hud-damage');
    this.dead = el('div', 'hud-dead');
    this.dead.textContent = STRINGS.hud.dead;

    this.root.append(this.damage, left, right, this.dead);
    parent.appendChild(this.root);

    this.unsubscribers.push(
      events.on('player:health', this.onHealth),
      events.on('points:changed', this.onPoints),
      events.on('points:gained', this.onPointsGained),
      events.on('round:changed', this.onRound),
      events.on('weapon:state', this.onWeapon),
      events.on('player:damaged', this.onDamaged),
      events.on('player:died', this.onDied),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    window.clearTimeout(this.damageTimer);
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
    const span = this.floatPool[this.nextFloat];
    if (!span) return;
    this.nextFloat = (this.nextFloat + 1) % this.floatPool.length;
    span.textContent = `+${e.amount}`;
    // Newest at the bottom of the stack; restart its rise-and-fade animation.
    this.floats.appendChild(span);
    span.classList.remove('is-active');
    void span.offsetWidth;
    span.classList.add('is-active');
  };

  private readonly onRound = (e: GameEvents['round:changed']): void => {
    this.round.textContent = `${STRINGS.hud.round} ${e.round}`;
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
