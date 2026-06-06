/**
 * Launch helper — removes ELECTRON_RUN_AS_NODE from environment
 * before spawning Electron, so Electron runs as a proper desktop app
 * rather than as a plain Node.js process.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const path = require('path');

// Resolve electron binary from local node_modules (project root)
const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', electronBin);

const child = spawn(`"${electronPath}" .`, {
  cwd: path.join(__dirname, '..', '..'),
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
