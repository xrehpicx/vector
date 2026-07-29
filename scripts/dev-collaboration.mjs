import { spawn } from 'node:child_process';
import path from 'node:path';

const port = 4200;
const nextBinary = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next',
);

const next = spawn(nextBinary, ['dev', '--turbopack', '--port', String(port)], {
  env: process.env,
  stdio: 'inherit',
});

let stopping = false;

async function prewarmAttachmentRoute() {
  const url = `http://127.0.0.1:${port}/api/collaboration/attachments/prewarm`;

  for (let attempt = 0; attempt < 120 && !stopping; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'manual',
      });
      console.log(
        `[dev:collaboration] Private media route ready (${response.status}).`,
      );
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (!stopping) {
    console.warn(
      '[dev:collaboration] Media route prewarm timed out; the app is still running.',
    );
  }
}

void prewarmAttachmentRoute();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (next.exitCode === null) next.kill(signal);
  });
}

next.on('exit', code => {
  stopping = true;
  process.exitCode = code ?? 1;
});
