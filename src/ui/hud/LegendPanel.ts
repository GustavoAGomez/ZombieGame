import { STRINGS } from '../strings';

/** One line of the legend: an upgrade or a curse, with its tag (rarity, «MALDICIÓN», «LA TIENES ×2») in its colour. */
export interface LegendEntry {
  name: string;
  tag: string;
  color: string;
  description: string;
}

/**
 * A read-only panel over the HUD that says what the dungeon's upgrades and
 * curses do (spec 09 §7, §9): the ones carried (the HUD's ⓘ), the one a
 * shop row offers (its ⓘ), or the pact's two while the player stands at the
 * altar. Plain DOM, no game logic; it closes with its X or when told.
 */
export class LegendPanel {
  readonly el: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly list: HTMLDivElement;
  /** Shown by the altar: it goes away by itself when the player leaves it. */
  private auto = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'legend-panel';
    this.el.hidden = true;
    const header = document.createElement('div');
    header.className = 'legend-panel__header';
    this.title = document.createElement('span');
    this.title.className = 'legend-panel__title';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'legend-panel__close';
    close.setAttribute('aria-label', STRINGS.legend.close);
    close.textContent = '×';
    close.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hide();
    });
    header.append(this.title, close);
    this.list = document.createElement('div');
    this.list.className = 'legend-panel__rows';
    this.el.append(header, this.list);
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Shows `entries` under `title`; `auto` marks a legend that hides on its own (the altar's). An empty list says so. */
  show(title: string, entries: readonly LegendEntry[], auto = false): void {
    this.auto = auto;
    this.title.textContent = title;
    const rows: HTMLElement[] = entries.map((entry) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      const head = document.createElement('div');
      head.className = 'legend-row__head';
      const name = document.createElement('span');
      name.className = 'legend-row__name';
      name.textContent = entry.name;
      name.style.color = entry.color;
      const tag = document.createElement('span');
      tag.className = 'legend-row__tag';
      tag.textContent = entry.tag;
      tag.style.color = entry.color;
      head.append(name, tag);
      const description = document.createElement('p');
      description.className = 'legend-row__description';
      description.textContent = entry.description;
      row.append(head, description);
      return row;
    });
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'legend-row__description';
      empty.textContent = STRINGS.legend.none;
      rows.push(empty);
    }
    this.list.replaceChildren(...rows);
    this.el.hidden = false;
  }

  /** Hides the legend; with `autoOnly`, only one the altar opened. */
  hide(autoOnly = false): void {
    if (autoOnly && !this.auto) return;
    this.el.hidden = true;
    this.auto = false;
  }

  toggle(title: string, entries: readonly LegendEntry[]): void {
    if (this.visible && !this.auto) this.hide();
    else this.show(title, entries);
  }

  destroy(): void {
    this.el.remove();
  }
}
