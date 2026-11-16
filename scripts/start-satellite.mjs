/**
 * Starts the optional FastAPI satellite service using the project's virtualenv
 * (backend/.venv), on Windows, macOS and Linux.
 *
 *   npm run satellite
 *
 * One-time setup:  cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python =
  process.platform === 'win32'
    ? path.join(root, 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(root, 'backend', '.venv', 'bin', 'python');

if (!existsSync(python)) {
  console.error('Python virtualenv not found at backend/.venv. Set it up once:');
  console.error('  cd backend');
  console.error('  python -m venv .venv');
  console.error(process.platform === 'win32' ? '  .venv\\Scripts\\pip install -r requirements.txt' : '  .venv/bin/pip install -r requirements.txt');
  process.exit(1);
}

const child = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--app-dir', path.join(root, 'backend'), '--port', process.env.SATELLITE_PORT || '8000'],
  { stdio: 'inherit', cwd: path.join(root, 'backend') }
);
child.on('exit', (code) => process.exit(code ?? 0));
