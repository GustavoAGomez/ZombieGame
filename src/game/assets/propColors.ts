/**
 * Placeholder colours for props (furniture, clutter) until their art exists:
 * a flat colour per material, guessed from words in the key, so a sofa, a
 * fridge and a car read as different things. Shared by the game and the map
 * preview (no Phaser here).
 */
const MATERIALS: readonly [RegExp, string][] = [
  [/sangre/, '#5e1c16'],
  [/aceite|mancha/, '#262322'],
  [/barbacoa|bidon|neumatico|rueda|metal|herramienta|banco_trabajo|caja_fuerte|aire|deposito|farola|cubo|latas/, '#4a4a4e'],
  [/sofa|sillon|cama|colchon|alfombra|cortina|ropa|abrigo|tumbona|flotador|saco_dormir|tienda/, '#6b4a5a'],
  [/coche|furgoneta/, '#3d5a73'],
  [/nevera|lavadora|secadora|horno|encimera|isla|fregadero|caldera|inodoro|lavabo|banera|ducha/, '#b8b8b0'],
  [/caja|carton|bolsa|saco|papel|buzon/, '#a0784a'],
  [/escombro|cascote|ladrillo|piedra/, '#8a8278'],
  [/seto|arbusto|arbol|planta|maceta|hierba/, '#4f6b34'],
  [/botell|vino|barril|tonel/, '#5a3a2a'],
  [/mesa|silla|banco|estanteria|armario|comoda|consola|escalera|piano|cuadro|madera|tablon|puerta|cajon|libro|barricada|aparador|escritorio|vajilla/, '#7a5232'],
];

export function propColor(key: string): string {
  return MATERIALS.find(([re]) => re.test(key))?.[1] ?? '#8a3fa0';
}

/** 0xRRGGBB → [r, g, b], shaded by `factor` (1 = as is). */
export function shade(hex: string, factor: number): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * factor)));
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}
