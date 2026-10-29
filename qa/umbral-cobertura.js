#!/usr/bin/env node
// Compuerta de calidad del pipeline: falla (código de salida 1) si la cobertura de líneas de los
// módulos críticos queda por debajo del umbral de la métrica M-01 del plan.
// Uso: node qa/umbral-cobertura.js <coverage-summary.json> [config-calidad.json]
'use strict';
const fs = require('fs');
const path = require('path');

const [archivo, config = path.join(__dirname, 'config-calidad.json')] = process.argv.slice(2);
const cov = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const cfg = JSON.parse(fs.readFileSync(config, 'utf8'));
const umbral = cfg.umbrales['M-01'];

let cubiertas = 0;
let totales = 0;
for (const rel of cfg.modulos_criticos) {
  const clave = Object.keys(cov).find((k) => k.replace(/\\/g, '/').endsWith(rel));
  if (!clave) {
    console.error(`El módulo crítico ${rel} no aparece en el reporte de cobertura.`);
    process.exit(1);
  }
  const { covered, total } = cov[clave].lines;
  cubiertas += covered;
  totales += total;
  console.log(`  ${rel.padEnd(40)} ${String(covered).padStart(4)} / ${String(total).padEnd(4)} ${cov[clave].lines.pct}%`);
}
const pct = Math.round((10000 * cubiertas) / totales) / 100;
console.log(`Cobertura de módulos críticos: ${pct}% (umbral ${umbral}%)`);
if (pct < umbral) {
  console.error('COMPUERTA NO SUPERADA: la cobertura de los módulos críticos está por debajo del umbral.');
  process.exit(1);
}
console.log('Compuerta de cobertura superada.');
