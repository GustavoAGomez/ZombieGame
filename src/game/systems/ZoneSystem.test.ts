import { describe, expect, it, vi } from 'vitest';
import { createMansionContext, player, zoneIndex } from '../../test/fixtures';
import { doorTarget, tryBuyDoor } from './DoorSystem';
import type { SimContext } from './SimContext';

/** Rooms are unlocked, not doors: buying a door sells the room behind it, and opens every way into it from an open room. */

const door = (ctx: SimContext, id: string): number => {
  const i = ctx.map.doors.findIndex((d) => d.id === id);
  if (i < 0) throw new Error(`No door ${id}`);
  return i;
};
const isOpen = (ctx: SimContext, id: string): boolean => ctx.state.doorsOpen[door(ctx, id)] === true;
const unlocked = (ctx: SimContext, id: string): boolean => ctx.state.zonesUnlocked[zoneIndex(ctx, id)] === true;

describe('unlocking rooms', () => {
  it('starts with every door closed: only the hall is open', () => {
    const ctx = createMansionContext();
    expect(ctx.state.doorsOpen.every((o) => !o)).toBe(true);
    expect(ctx.map.zones.filter((_, i) => ctx.state.zonesUnlocked[i]).map((z) => z.id)).toEqual(['recibidor']);
  });

  it('unlocking a room opens every door between it and the rooms already open', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    p.money = 100_000;
    // Hall → dining room → kitchen.
    expect(tryBuyDoor(ctx, p, door(ctx, 'D2'))).toBe(true);
    expect(tryBuyDoor(ctx, p, door(ctx, 'D4'))).toBe(true);
    // Hall → living room → library: the library's other door, to the kitchen (open already), opens by itself.
    expect(tryBuyDoor(ctx, p, door(ctx, 'D1'))).toBe(true);
    expect(isOpen(ctx, 'D5')).toBe(false);
    expect(tryBuyDoor(ctx, p, door(ctx, 'D3'))).toBe(true);
    expect(isOpen(ctx, 'D5')).toBe(true);
    expect(unlocked(ctx, 'biblioteca')).toBe(true);
  });

  it('doors to rooms still locked stay closed and sell those rooms: no chain of free rooms', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    p.money = 100_000;
    tryBuyDoor(ctx, p, door(ctx, 'D2'));
    tryBuyDoor(ctx, p, door(ctx, 'D4'));
    for (const id of ['D5', 'D6', 'D9']) expect(isOpen(ctx, id), id).toBe(false);
    expect(ctx.map.zones[doorTarget(ctx.map, ctx.state, door(ctx, 'D6'))]?.id).toBe('garaje');
    expect(ctx.map.zones[doorTarget(ctx.map, ctx.state, door(ctx, 'D9'))]?.id).toBe('jardin');
    expect(unlocked(ctx, 'garaje') || unlocked(ctx, 'jardin')).toBe(false);
  });

  it('a room costs the same through any of its doors', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    const opened = vi.fn();
    ctx.events.on('door:opened', opened);
    // The street through the front door (it used to cost 1500 there): the street's price, 1250.
    p.money = 1250;
    expect(tryBuyDoor(ctx, p, door(ctx, 'D8'))).toBe(true);
    expect(p.money).toBe(0);
    expect(unlocked(ctx, 'calle')).toBe(true);
    expect(opened).toHaveBeenCalledWith({ doorId: 'D8', playerId: p.id });
    // Not enough money: nothing opens.
    expect(tryBuyDoor(ctx, p, door(ctx, 'D7'))).toBe(false);
    expect(unlocked(ctx, 'garaje')).toBe(false);
  });
});
