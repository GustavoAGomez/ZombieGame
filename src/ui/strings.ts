/** Every user-visible text, in Spanish. */
export const STRINGS = {
  gameTitle: 'ZOMBIES',
  rotateDevice: 'GIRA EL MÓVIL',
  rotateDeviceHint: 'Este juego se juega en horizontal',
  debug: {
    nextRound: 'RONDA +1',
    points: '+5000$',
    god: 'DIOS',
    hitboxes: 'HITBOX',
    flowField: 'FLUJO',
    levelUp: '+NIVEL ARMA',
    special: 'ESPECIAL ARMA',
    boost: 'DAR MEJORA',
    moveMerchants: 'MOVER MAGOS',
    redGold: 'ROJO/DORADO',
    bigPoints: '+10000$',
    giveSmg: 'DAR SMG',
    giveShotgun: 'DAR ESCOPETA',
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
    shotgun: 'ESCOPETA',
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
    reasons: {
      ammoFull: 'MUNICIÓN COMPLETA',
      maxLevel: 'NIVEL MÁXIMO',
      notUpgradable: 'NO MEJORABLE',
      hasSpecial: 'YA TIENE ESPECIAL',
      noSpecial: 'SIN MEJORA ESPECIAL',
    },
    comeBack: 'VUELVE EN OTRA RONDA',
    close: 'Cerrar tienda',
    /** The round boost row says which boost this visit sells. */
    boosts: { speed: 'Velocidad ×1,5 durante 10 s', double_damage: 'Doble daño durante 10 s' },
    /** The red merchant's row: the weapon in hand, the level it goes to and what that level does. */
    levelUp: (weapon: string, level: number, max: number, effect: string | null): string => {
      if (max === 0) return `${weapon}: no se puede mejorar`;
      if (level >= max || !effect) return `${weapon}: nivel máximo`;
      return `${weapon}: nivel ${level} → ${level + 1}, ${effect}`;
    },
    /** What each upgrade level does, for the red merchant's row. */
    upgradeEffects: { ammo_x2: 'munición ×2', fire_rate: 'cadencia ×1,5', damage_x2: 'daño ×2' },
    /** The gold merchant's rows, one per weapon. */
    specials: {
      pistol: 'Pistola: 3 balas en abanico por disparo',
      smg: 'SMG: cada bala atraviesa 3 zombis',
      shotgun: 'Escopeta: los perdigones prenden fuego',
    },
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
    /** Weapon cases (spec 04 §3), money with the "1000$" format like everywhere else. */
    buyWeapon: (weapon: string, price: string): string => `${weapon} · ${price}`,
    weaponAmmo: (weapon: string, price: string): string => `MUNICIÓN ${weapon} · ${price}`,
    ammoFull: 'MUNICIÓN COMPLETA',
    /** "CAMBIAR PISTOLA ★★ POR SMG": the stars of the weapon going away sit between the two parts. */
    swapFrom: (weapon: string): string => `CAMBIAR ${weapon}`,
    swapTo: (weapon: string): string => `POR ${weapon}`,
    buyWeaponLabel: (weapon: string): string => `Comprar ${weapon}`,
    /** Special items on the floor (spec 05 §3): "RECOGER VARITA DESGASTADA". */
    pickUp: (item: string): string => `RECOGER ${item}`,
    inventoryFull: 'INVENTARIO LLENO',
  },
  /** Special items (spec 05), by id. */
  items: {
    names: { living_heart: 'CORAZÓN VIVO', worn_wand: 'VARITA DESGASTADA' },
    /** A tap on an item where it does nothing (spec 05 §5). */
    cantUse: 'AQUÍ NO SE USA',
    use: (item: string): string => `Usar ${item}`,
    inventory: 'Objetos',
  },
} as const;
