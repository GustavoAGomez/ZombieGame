/** Every user-visible text, in Spanish. */
export const STRINGS = {
  gameTitle: 'ZOMBIES',
  rotateDevice: 'GIRA EL MÓVIL',
  rotateDeviceHint: 'Este juego se juega en horizontal',
  debug: {
    nextRound: 'RONDA +1',
    points: '+1000',
    god: 'DIOS',
    hitboxes: 'HITBOX',
    flowField: 'FLUJO',
  },
  controls: {
    joystick: 'Joystick de movimiento',
    fire: 'Disparar: arrastra para apuntar',
    weaponSlot: (n: number) => `Arma ${n}`,
    special: 'Movimiento especial',
    reload: 'Recargar',
    melee: 'Cuchillo',
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
    vibration: (on: boolean): string => (on ? 'VIBRACIÓN: SÍ' : 'VIBRACIÓN: NO'),
  },
  gameOver: {
    title: 'FIN DE LA PARTIDA',
    survived: (rounds: number): string => (rounds === 1 ? 'HAS SOBREVIVIDO 1 RONDA' : `HAS SOBREVIVIDO ${rounds} RONDAS`),
    points: 'PUNTOS',
    retry: 'REINTENTAR',
  },
  merchants: {
    names: { blue: 'MAGO AZUL', red: 'MAGO ROJO', gold: 'MAGO DORADO' },
    moved: (name: string): string => `EL ${name} SE HA MOVIDO`,
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
