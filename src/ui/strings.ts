/** Every user-visible text, in Spanish. */
export const STRINGS = {
  gameTitle: 'ZOMBIES',
  rotateDevice: 'GIRA EL MÓVIL',
  rotateDeviceHint: 'Este juego se juega en horizontal',
  controls: {
    joystick: 'Joystick de movimiento',
    fire: 'Disparar: arrastra para apuntar',
    switchWeapon: 'Cambiar de arma',
    weaponShort: 'ARMA',
    special: 'Movimiento especial',
    specialShort: 'ESPECIAL',
  },
  weapons: {
    pistol: 'PISTOLA',
    smg: 'SMG',
  },
  hud: {
    points: 'PUNTOS',
    round: 'RONDA',
    reloading: 'Recargando',
    health: 'Vida',
    dead: 'HAS MUERTO',
  },
  actions: {
    repair: 'REPARAR',
    openDoor: 'ABRIR PUERTA',
    openStairs: 'ABRIR ESCALERA',
    openHatch: 'ABRIR TRAMPILLA',
    locked: 'BLOQUEADA',
    missing: 'FALTAN',
  },
} as const;
