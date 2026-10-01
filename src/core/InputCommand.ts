/**
 * Everything a player can ask for during one simulation tick. Touch
 * handlers only fill this in; systems read it (CLAUDE.md rule 2). In the
 * online version this same record is what gets sent to the server.
 */
export interface InputCommand {
  /** Tick this command was produced for. */
  tick: number;
  /** Movement vector. Length is the analog speed factor (0..1). */
  moveX: number;
  moveY: number;
  /** Fire held this tick. */
  fire: boolean;
  /** True when the fire stick is dragged past the threshold. */
  aimManual: boolean;
  /** Unit aim vector, only meaningful when aimManual is true. */
  aimX: number;
  aimY: number;
  /** Edge-triggered: pressed since the previous tick. Next weapon (keyboard Q). */
  switchWeapon: boolean;
  /** Weapon slot picked on the HUD this tick, -1 for none. */
  selectWeapon: number;
  reload: boolean;
  /** Knife button. */
  melee: boolean;
  special: boolean;
  actionPressed: boolean;
  /** Held (e.g. hold-to-repair). */
  action: boolean;
  /** Item of the open shop's catalogue bought this tick (its index), -1 for none. */
  shopBuy: number;
  /** For an item sold per weapon (the gold merchant's special): which weapon slot, -1 otherwise. */
  shopSlot: number;
  /** The shop's X was tapped. */
  shopClose: boolean;
  /** The stored boost's button was tapped (spec 03 §5). */
  boost: boolean;
}

export function createInputCommand(): InputCommand {
  return {
    tick: 0,
    moveX: 0,
    moveY: 0,
    fire: false,
    aimManual: false,
    aimX: 0,
    aimY: 0,
    switchWeapon: false,
    selectWeapon: -1,
    reload: false,
    melee: false,
    special: false,
    actionPressed: false,
    action: false,
    shopBuy: -1,
    shopSlot: -1,
    shopClose: false,
    boost: false,
  };
}

export function resetInputCommand(cmd: InputCommand): InputCommand {
  cmd.moveX = 0;
  cmd.moveY = 0;
  cmd.fire = false;
  cmd.aimManual = false;
  cmd.aimX = 0;
  cmd.aimY = 0;
  cmd.switchWeapon = false;
  cmd.selectWeapon = -1;
  cmd.reload = false;
  cmd.melee = false;
  cmd.special = false;
  cmd.actionPressed = false;
  cmd.action = false;
  cmd.shopBuy = -1;
  cmd.shopSlot = -1;
  cmd.shopClose = false;
  cmd.boost = false;
  return cmd;
}
