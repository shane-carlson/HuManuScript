#!/usr/bin/env node
/** Rasterize build/icon.svg to build/icon.png (512×512). */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'build', 'icon.svg');
const outPath = path.join(root, 'build', 'icon.png');

const svg = await readFile(svgPath, 'utf8');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } });
const png = resvg.render().asPng();
await writeFile(outPath, png);
console.log('Wrote', outPath);
