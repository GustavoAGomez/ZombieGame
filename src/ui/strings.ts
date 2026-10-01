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
    levelUp: '+NIVEL ARMA',
    special: 'ESPECIAL ARMA',
    boost: 'DAR MEJORA',
    moveMerchants: 'MOVER MAGOS',
    redGold: 'ROJO/DORADO',
    bigPoints: '+10000',
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
    /** Points: everything earned this match (the score). */
    points: 'PUNTOS',
    /** Money to spend, and the floating gains and expenses. */
    money: (amount: number): string => `${amount}$`,
    moneyGained: (amount: number): string => `+${amount}$`,
    moneySpent: (amount: number): string => `-${amount}$`,
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
  boosts: {
    names: { speed: 'VELOCIDAD', double_damage: 'DOBLE DAÑO' },
    activate: (name: string): string => `Activar mejora: ${name}`,
    activated: (name: string): string => `¡${name}!`,
  },
  merchants: {
    names: { blue: 'MAGO AZUL', red: 'MAGO ROJO', gold: 'MAGO DORADO' },
    moved: (name: string): string => `EL ${name} SE HA MOVIDO`,
  },
  shop: {
    buy: 'COMPRAR',
    missing: (money: number): string => `FALTAN ${money}$`,
    reasons: { ammoFull: 'MUNICIÓN COMPLETA', maxLevel: 'NIVEL MÁXIMO', hasSpecial: 'YA TIENE ESPECIAL' },
    comeBack: 'VUELVE EN OTRA RONDA',
    close: 'Cerrar tienda',
    /** The round boost row says which boost this visit sells. */
    boosts: { speed: 'Velocidad ×1,5 durante 10 s', double_damage: 'Doble daño durante 10 s' },
    /** The red merchant's row: the weapon in hand and the level it goes to. */
    levelUp: (weapon: string, level: number): string => (level >= 3 ? `${weapon}: nivel máximo` : `${weapon}: nivel ${level} → ${level + 1}`),
    /** The gold merchant's rows, one per weapon. */
    specials: { pistol: 'Pistola: 3 balas en abanico por disparo', smg: 'SMG: cada bala atraviesa 3 zombis' },
    items: {
      max_ammo: { name: 'MUNICIÓN MÁXIMA', description: 'Llena cargadores y reservas' },
      round_boost: { name: 'MEJORA DE LA RONDA', description: 'Una mejora de 10 s, para cuando quieras' },
      weapon_level: { name: 'MEJORAR ARMA ACTUAL', description: 'Sube un nivel el arma en mano' },
      weapon_special: { name: 'MEJORA ESPECIAL', description: 'Una mejora única para un arma' },
    },
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
