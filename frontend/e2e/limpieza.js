// globalSetup y globalTeardown de Playwright: borra de ecoreporte_test los datos que crean las
// pruebas (marca [PRUEBA AUTOMATIZADA] y cuentas prueba.*@prueba.test) con el script del backend.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');

export default function limpiarDatosDePrueba() {
  execFileSync(process.execPath, ['scripts/limpiar-datos-prueba.js'], { cwd: BACKEND, stdio: 'inherit' });
}
