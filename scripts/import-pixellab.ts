/**
 * npm run assets:import — imports raw PixelLab exports from
 * art-src/pixellab/<asset>/ (docs/ASSETS.md §6).
 *
 * The real export layout is not known yet (loose frames or sheets, varying
 * direction/animation names). Until the first export exists, this script
 * inspects what is there and reports it; the normalisation step is written
 * against that first real sample (see docs/DECISIONS.md).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = resolve(root, 'art-src/pixellab');
  const assets = existsSync(source)
    ? readdirSync(source).filter((name) => !name.startsWith('.') && statSync(join(source, name)).isDirectory())
    : [];

  if (assets.length === 0) {
    console.info('No hay exports en art-src/pixellab/<asset>/. Nada que importar.');
    return;
  }

  for (const asset of assets) {
    const files = listFiles(join(source, asset));
    console.info(`\n${asset}: ${files.length} archivos`);
    for (const file of files.slice(0, 20)) console.info(`  ${relative(source, file)}`);
    if (files.length > 20) console.info(`  … y ${files.length - 20} más`);
  }
  console.error(
    '\nFormato de export todavía no soportado: la normalización se implementará con este primer export real ' +
      '(ver docs/ASSETS.md §6 y docs/DECISIONS.md).',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
