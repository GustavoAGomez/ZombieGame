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
    /** «Probar en partida» (spec 08 §4.4). */
    soundTestHint: 'La partida está en silencio mientras este panel está abierto. Toca A, B o C para oír un candidato: desde ese momento también suena en la partida.',
    copyChoice: 'COPIAR ELECCIÓN',
    copied: 'COPIADO',
    copyFailed: 'COPIA EL TEXTO',
    clearTrials: 'BORRAR PRUEBAS',
    choiceTitle: 'Elección de sonidos:',
    noTrials: 'Ningún candidato en prueba.',
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
    /** Spec 09 §1: the two games, each with its line and its record under its button. */
    survival: 'SUPERVIVENCIA',
    survivalSubtitle: 'SOBREVIVE TODAS LAS RONDAS QUE PUEDAS',
    survivalRecord: (round: number): string => `MEJOR RONDA: ${round}`,
    dungeon: 'MAZMORRA',
    dungeonSubtitle: 'TRES PLANTAS AL AZAR Y UN BOSS EN CADA UNA',
    dungeonRecord: (floor: number, rooms: number): string => `MEJOR PLANTA: ${floor} · ${rooms === 1 ? '1 SALA' : `${rooms} SALAS`}`,
    dungeonWins: (wins: number, time: string): string => `${wins === 1 ? '1 VICTORIA' : `${wins} VICTORIAS`} · MEJOR ${time}`,
    noRecord: 'SIN RÉCORD',
  },
  /** The dungeon (spec 09): the floor's label and banner. */
  dungeon: {
    floor: (n: number): string => `PLANTA ${n}`,
    ambients: { mansion: 'MANSIÓN', basement: 'SÓTANO', garden: 'JARDÍN' } as Record<string, string>,
    floorBanner: (n: number, ambient: string): string => `PLANTA ${n} · ${ambient}`,
    counter: 'SALAS HASTA EL MAGO',
    wizardHere: 'EL MAGO TE ESPERA',
    /** The pact sealed (spec 09 §9): the curse, said out loud. */
    pactSealed: (curse: string): string => `PACTO SELLADO · ${curse}`,
    minimap: 'MINIMAPA',
    keys: (n: number): string => (n === 1 ? '1 LLAVE' : `${n} LLAVES`),
    bossKey: 'LLAVE DEL BOSS',
    /** The end of a run (§10). */
    fell: 'HAS CAÍDO',
    escaped: 'HAS ESCAPADO',
    floorReached: (n: number): string => `PLANTA ${n}`,
    roomsCleared: (n: number): string => (n === 1 ? '1 SALA LIMPIA' : `${n} SALAS LIMPIAS`),
    kills: (n: number): string => (n === 1 ? '1 BAJA' : `${n} BAJAS`),
    time: (clock: string): string => `TIEMPO ${clock}`,
    seed: (seed: number): string => `SEMILLA ${seed}`,
    again: 'OTRA PARTIDA',
    sameSeed: 'MISMA SEMILLA',
    menu: 'MENÚ',
    keepGoing: 'SEGUIR',
    newRecord: '¡NUEVO RÉCORD!',
  },
  /** Seconds as M:SS (a run's time, spec 09 §10). */
  clock: (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
    /** The dungeon (spec 09 §4.2): the upgrades and curses carried, a tap on one says what it does. */
    upgrades: 'MEJORAS',
    noUpgrades: 'Todavía ninguna. El mago aparece cada 5 salas limpias.',
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
      hpFull: 'VIDA COMPLETA',
    },
    /** A free row (the boss's chest, spec 09 §7.3). */
    take: 'ELEGIR',
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
      /** The dungeon's wizard (spec 09 §7.1); an upgrade row takes its name and text from `upgrades`. */
      upgrade: { name: 'MEJORA', description: '' },
      reroll: { name: 'CAMBIAR OFERTA', description: 'Tres mejoras nuevas; cada vez cuesta 50$ más' },
      key: { name: 'LLAVE', description: 'Abre la sala del tesoro o un cofre cerrado' },
      medkit: { name: 'BOTIQUÍN', description: '+40 de vida, aquí mismo' },
    },
    /** The boss's chest (spec 09 §7.3): one of three, free. */
    bossChest: 'COFRE DEL BOSS',
    free: 'GRATIS',
    chosen: 'ELEGIDA',
  },
  /** The permanent upgrades (spec 09 §7.2) and the curses (§9), by id. */
  upgrades: {
    rarities: { common: 'COMÚN', rare: 'RARA', legendary: 'LEGENDARIA' } as Record<string, string>,
    names: {
      vitality: 'VITALIDAD',
      quick_hands: 'MANOS RÁPIDAS',
      light_feet: 'PIES LIGEROS',
      magnet: 'IMÁN',
      greed: 'CODICIA',
      deep_pockets: 'BOLSILLOS HONDOS',
      sharp_knife: 'FILO',
      piercing: 'PERFORANTES',
      ricochet: 'REBOTE',
      incendiary: 'INCENDIARIAS',
      volatile: 'VOLÁTILES',
      leech: 'SANGUIJUELA',
      second_wind: 'SEGUNDO AIRE',
      adrenaline: 'ADRENALINA',
      fan_fire: 'ABANICO',
      shadow_dash: 'PASO DE SOMBRA',
      ward: 'AMULETO',
      executioner: 'VERDUGO',
    } as Record<string, string>,
    descriptions: {
      vitality: '+25 de vida máxima y cura 25',
      quick_hands: 'Recargas un 25 % más rápido',
      light_feet: '+10 % de velocidad',
      magnet: 'Recoges desde 3 veces más lejos y nada caduca en el suelo',
      greed: '+30 % de dinero',
      deep_pockets: '+50 % de munición de reserva',
      sharp_knife: 'El cuchillo hace el doble de daño y llega un 30 % más lejos',
      piercing: 'Las balas atraviesan a un enemigo más',
      ricochet: 'Las balas rebotan una vez en las paredes',
      incendiary: '20 % de prender al enemigo',
      volatile: 'Los enemigos estallan al morir: 2 de daño a los de alrededor',
      leech: 'Curas 5 cada 10 bajas',
      second_wind: 'Un segundo dash',
      adrenaline: 'Con la vida baja, +30 % de cadencia y de velocidad',
      fan_fire: 'Dos proyectiles más a los lados, con la mitad de daño',
      shadow_dash: 'El dash hace 3 de daño y deja un rastro de fuego',
      ward: 'Absorbe el primer golpe de cada sala',
      executioner: '15 % de golpe crítico, con el triple de daño',
    } as Record<string, string>,
    curses: {
      frail: { name: 'FRÁGIL', description: '−25 de vida máxima' },
      hunted: { name: 'ACOSADO', description: 'Los enemigos corren un 15 % más' },
      tithe: { name: 'DIEZMO', description: 'Los magos cobran un 30 % más' },
      leak: { name: 'FUGA', description: '−30 % de munición de reserva' },
    } as Record<string, { name: string; description: string }>,
    /** «×2» after a name held twice. */
    copies: (n: number): string => (n > 1 ? ` ×${n}` : ''),
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
    /** The dungeon (spec 09 §4.1, §6): chests, keyed doors, the challenge's warning and the way down. */
    openChest: 'ABRIR COFRE',
    openChestKey: 'ABRIR COFRE · 1 LLAVE',
    needKey: 'FALTA UNA LLAVE',
    takeWeapon: (weapon: string): string => `COGER ${weapon}`,
    takeAmmo: 'MUNICIÓN Y 200$',
    openDoorKey: 'ABRIR · 1 LLAVE',
    openBossDoor: 'ABRIR · LLAVE DEL BOSS',
    needBossKey: 'FALTA LA LLAVE DEL BOSS',
    challengeRoom: 'SALA DE RETO',
    descend: 'BAJAR',
    /** The altar (spec 09 §9): the legendary for the curse, and the second tap that seals it. */
    pact: (upgrade: string, curse: string): string => `ACEPTAR PACTO · ${upgrade} POR ${curse}`,
    pactConfirm: (upgrade: string, curse: string): string => `¿SEGURO? ${upgrade} POR ${curse}`,
    /** The dungeon's hand, after its one payment of the floor (spec 09 §9). */
    handSpent: 'LA MANO YA HA DADO LO SUYO',
    dungeonLabel: 'Acción de la mazmorra',
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
