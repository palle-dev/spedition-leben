// src/lib/simulation ist die gepflegte Quelle. Der Base44-Export benötigt
// lokale Dateien unter shared; dieser Schritt erzeugt genau diese Kopien.
import { readdir, readFile, writeFile } from 'node:fs/promises';
const source = new URL('../src/lib/simulation/', import.meta.url);
const target = new URL('../base44/shared/', import.meta.url);
let count = 0;
for (const name of await readdir(source)) {
  if (!/\.(ts|js)$/.test(name)) continue;
  const data = await readFile(new URL(name, source));
  await writeFile(new URL(name, target), data);
  count++;
}
console.log(`${count} Simulationsmodule synchronisiert.`);
