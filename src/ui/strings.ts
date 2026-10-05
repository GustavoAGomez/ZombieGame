import type { SoundFamily, VolumeLevel } from '../config/audio';
import type { BossId, BossVariantId } from '../config/bosses';
import type { WeaponId } from '../config/weapons';
/** Rooms by zone id, with their gender for «COCINA DESBLOQUEADA» / «GARAJE DESBLOQUEADO». */
const ZONES: Readonly<Record<string, { name: string; feminine: boolean }>> = {
  recibidor: { name: 'RECIBIDOR', feminine: false },
  salon: { name: 'SALÓN', feminine: false },
  comedor: { name: 'COMEDOR', feminine: false },
  biblioteca: { name: 'BIBLIOTECA', feminine: true },
  cocina: { name: 'COCINA', feminine: true },
  garaje: { name: 'GARAJE', feminine: false },
  jardin: { name: 'JARDÍN', feminine: false },
  calle: { name: 'CALLE', feminine: true },
  sotano: { name: 'SÓTANO', feminine: false },
  azotea: { name: 'AZOTEA', feminine: true },
  // The test map (room01).
  pasillo: { name: 'PASILLO', feminine: false },
  almacen: { name: 'ALMACÉN', feminine: false },
};
/** A zone without a name here. */
const ROOM = { name: 'SALA', feminine: true };

/** The pause menu's volume settings (spec 08 §2). */
const VOLUME_LABELS: Readonly<Record<VolumeLevel, string>> = { high: 'ALTO', medium: 'MEDIO', low: 'BAJO', off: 'NO' };

/** Every user-visible text, in Spanish. */
export const STRINGS = {
  gameTitle: 'ZOMBIES',
  rotateDevice: 'GIRA EL MÓVIL',
  rotateDeviceHint: 'Este juego se juega en horizontal',
  debug: {
    title: 'DEPURACIÓN',
    close: 'CERRAR',
    /** Spec 08 §8: every sound of the catalog, by family. */
    soundTest: 'PRUEBA DE SONIDOS',
    soundBack: 'VOLVER',
    simulateCombat: 'SIMULAR COMBATE',
    simulateStreak: 'SIMULAR RACHA',
    soundFamilies: { hit: 'GOLPE', reward: 'PREMIO', threat: 'AMENAZA', ui: 'INTERFAZ', jingle: 'CARTELES', music: 'MÚSICA' } satisfies Record<SoundFamily, string>,
    soundStats: (voices: number, dropped: number, last: string, state: string): string =>
      `VOCES ${voices} · DESCARTADAS ${dropped}${last ? ` (ÚLTIMA: ${last})` : ''} · AUDIO: ${state.toUpperCase()}`,
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
    giveKatana: 'DAR KATANA',
    giveLaser: 'DAR LÁSER',
    giveFlamethrower: 'DAR LANZALLAMAS',
    freeHand: 'MANO GRATIS',
    moveHand: 'MOVER MANO',
    forceMock: 'FORZAR BURLA',
    handSpots: 'MOSTRAR PUNTOS DE MANO',
    /** Spec 05 §8. */
    giveItems: 'DAR OBJETOS',
    goToWand: 'IR A LA VARITA',
    itemSpots: 'MOSTRAR PUNTOS DE OBJETO',
    /** Spec 07 §10. */
    goToBossRound: 'IR A RONDA 6',
    nextBossRound: 'SIGUIENTE RONDA DE BOSS',
    bossVariant: (name: string): string => `VARIANTE: ${name}`,
    bossZones: 'MOSTRAR ZONAS DE DAÑO',
    summonBoss: 'INVOCAR MATARIFE',
    killBoss: 'MATAR BOSS',
    forceCharge: 'FORZAR EMBESTIDA',
    forceSlam: 'FORZAR MAZAZO',
    forceLeap: 'FORZAR SALTOS',
  },
  controls: {
    joystick: 'Joystick de movimiento',
    fire: 'Disparar: arrastra para apuntar',
    /** The fire button with a melee weapon in hand (the katana): it cuts ahead, no aim. */
    slash: 'Cortar hacia delante',
    weaponSlot: (n: number) => `Arma ${n}`,
    special: 'Movimiento especial',
    reload: 'Recargar',
    melee: 'Cuchillo',
  },
  weapons: {
    pistol: 'PISTOLA',
    smg: 'SMG',
    shotgun: 'ESCOPETA',
    katana: 'KATANA',
    laser: 'LÁSER',
    flamethrower: 'LANZALLAMAS',
  },
  hud: {
    battery: 'Batería',
    /** The laser ran dry (spec 06 §2.1): locked for a few seconds. */
    overheated: 'SOBRECALENTADO',
    /** The katana out of uses: useless until the blue merchant repairs it. */
    broken: 'ROTA',
    /** What the laser's marks count: overheats left before it breaks for good. */
    overheatsLeft: (n: number): string => `Sobrecalentamientos antes de romperse: ${n}`,
    usesLeft: (n: number): string => `Usos antes de romperse: ${n}`,
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
    /** Spec 08 §2: the effects and music volume, rotating on each tap. */
    sfx: (level: VolumeLevel): string => `EFECTOS: ${VOLUME_LABELS[level]}`,
    music: (level: VolumeLevel): string => `MÚSICA: ${VOLUME_LABELS[level]}`,
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
    /** Brought out by an activation (spec 05 §6). */
    summoned: (name: string): string => `EL ${name} HA SIDO INVOCADO`,
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
      likeNew: 'COMO NUEVA',
    },
    comeBack: 'VUELVE EN OTRA RONDA',
    close: 'Cerrar tienda',
    /** The round boost row says which boost this visit sells. */
    boosts: { speed: 'Velocidad ×1,5 durante 10 s', double_damage: 'Doble daño durante 10 s' },
    /** A red merchant's row: the weapon in hand, the level of that kind it goes to and what it gives then. */
    levelUp: (weapon: string, level: number, max: number, effect: string | null): string => {
      if (max === 0) return `${weapon}: no se puede mejorar`;
      if (level >= max || !effect) return `${weapon}: nivel máximo`;
      return `${weapon}: nivel ${level} → ${level + 1}, ${effect}`;
    },
    /** What a kind of upgrade gives at a level: "munición ×1,5". */
    upgradeEffect: (kind: 'ammo' | 'fire_rate' | 'damage', factor: number): string =>
      `${{ ammo: 'munición', fire_rate: 'cadencia', damage: 'daño' }[kind]} ×${String(factor).replace('.', ',')}`,
    /** The blue merchant's repair row: the weapon, its uses left (broken at 0) and all it gets back. */
    repairState: (weapon: string, uses: number, max: number): string =>
      uses <= 0 ? `${weapon} rota: vuelve a ${max} usos` : `${weapon}: quedan ${uses} de ${max} usos`,
    /** The gold merchant's rows, one per weapon. */
    /** What each weapon's special does (only the weapons that have one). */
    specials: {
      pistol: 'Pistola: 3 balas en abanico por disparo',
      smg: 'SMG: cada bala atraviesa 3 zombis',
      shotgun: 'Escopeta: los perdigones prenden fuego',
      katana: 'Katana: cada zombi que mata te cura 2 de vida',
      laser: 'Láser: doble daño y la batería dura el doble',
      flamethrower: 'Lanzallamas: los que mueren ardiendo estallan',
    } as Readonly<Partial<Record<WeaponId, string>>>,
    items: {
      max_ammo: { name: 'MUNICIÓN MÁXIMA', description: 'Llena cargadores y reservas' },
      round_boost: { name: 'MEJORA DE LA RONDA', description: 'Una mejora de 10 s, para cuando quieras' },
      upgrade_ammo: { name: 'MEJORAR MUNICIÓN', description: 'Más cargador y reserva para el arma en mano' },
      upgrade_fire_rate: { name: 'MEJORAR CADENCIA', description: 'El arma en mano dispara más rápido' },
      upgrade_damage: { name: 'MEJORAR DAÑO', description: 'Más daño por bala para el arma en mano' },
      weapon_special: { name: 'MEJORA ESPECIAL', description: 'Una mejora única para un arma' },
      repair: { name: 'REPARAR', description: 'Devuelve todos sus usos a un arma que se desgasta' },
    },
  },
  actions: {
    repair: 'REPARAR',
    /** Doors and main stairs sell the room behind them without saying which: "DESBLOQUEAR · 1000$", or what is missing. */
    unlockRoom: (price: string): string => `DESBLOQUEAR · ${price}`,
    unlockRoomMissing: (missing: string): string => `DESBLOQUEAR · FALTAN ${missing}`,
    unlockRoomLabel: 'Desbloquear sala',
    /** A secondary staircase or hatch: it opens by itself once both its rooms are unlocked. */
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
    /** The Demon's Hand (spec 06 §3.3): pay, the blood pact when short of money, then take its weapon. */
    handPay: (price: string): string => `MANO DEL DEMONIO · ${price}`,
    bloodPact: (health: number): string => `PACTO DE SANGRE · ${health} VIDA`,
    handTake: (weapon: string): string => `COGER ${weapon}`,
    handLabel: 'Mano del Demonio',
    /** Special items on the floor (spec 05 §3): "RECOGER VARITA DESGASTADA". */
    pickUp: (item: string): string => `RECOGER ${item}`,
    inventoryFull: 'INVENTARIO LLENO',
  },
  /** Only once a room is unlocked does the HUD say which: «COCINA DESBLOQUEADA», «GARAJE DESBLOQUEADO» (SALA if unnamed). */
  zoneUnlocked: (zone: string): string => {
    const room = ZONES[zone] ?? ROOM;
    return `${room.name} ${room.feminine ? 'DESBLOQUEADA' : 'DESBLOQUEADO'}`;
  },
  /** The Demon's Hand (spec 06 §3.6). */
  hand: {
    moved: 'LA MANO SE HA MOVIDO',
  },
  /** A weapon that broke: the katana out of uses (repairable), the laser at its last overheat (lost). */
  weaponBroken: {
    katana: 'LA KATANA SE HA ROTO',
    laser: 'EL LÁSER SE HA ROTO',
  } as Readonly<Partial<Record<WeaponId, string>>>,
  /** Bosses (spec 07), by id: the name over their health bar. */
  bosses: {
    names: { butcher: 'MATARIFE' } as Readonly<Record<BossId, string>>,
    /** Its health bar, for screen readers. */
    health: (name: string): string => `Vida de ${name}`,
    /** Under the round banner in a boss round (spec 07 §6). */
    incoming: 'ALGO GRANDE SE ACERCA',
    /** The variants, by id (the debug panel's selector). */
    variants: { base: 'BASE', rabid: 'RABIOSO', putrid: 'PÚTRIDO' } as Readonly<Record<BossVariantId, string>>,
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
