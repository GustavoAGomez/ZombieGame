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
    reload: 'Recargar',
    reloadShort: 'RECARGAR',
    melee: 'Cuchillo',
    meleeShort: 'CUCHILLO',
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
  title: {
    subtitle: 'SOBREVIVE TODAS LAS RONDAS QUE PUEDAS',
    play: 'JUGAR',
  },
  pause: {
    button: 'Pausa',
    title: 'PAUSA',
    resume: 'CONTINUAR',
    restart: 'REINICIAR',
  },
  gameOver: {
    title: 'FIN DE LA PARTIDA',
    survived: (rounds: number): string => (rounds === 1 ? 'HAS SOBREVIVIDO 1 RONDA' : `HAS SOBREVIVIDO ${rounds} RONDAS`),
    points: 'PUNTOS',
    retry: 'REINTENTAR',
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
