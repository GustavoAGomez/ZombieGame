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
  /** Edge-triggered: pressed since the previous tick. */
  switchWeapon: boolean;
  reload: boolean;
  /** Knife button. */
  melee: boolean;
  special: boolean;
  actionPressed: boolean;
  /** Held (e.g. hold-to-repair). */
  action: boolean;
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
    reload: false,
    melee: false,
    special: false,
    actionPressed: false,
    action: false,
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
  cmd.reload = false;
  cmd.melee = false;
  cmd.special = false;
  cmd.actionPressed = false;
  cmd.action = false;
  return cmd;
}
