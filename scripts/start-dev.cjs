const { spawn } = require('node:child_process');
const path = require('node:path');

const angularCli = require.resolve('@angular/cli/bin/ng.js');
const children = [
  spawn(process.execPath, [path.resolve(__dirname, '..', 'server', 'cp-proxy.cjs')], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, [angularCli, 'serve', ...process.argv.slice(2)], {
    stdio: 'inherit',
  }),
];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a development service.', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
