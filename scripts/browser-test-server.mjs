import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export async function startPreview() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const url = `http://127.0.0.1:${address.port}`;
  const server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(address.port),
      '--strictPort',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (data) => {
      output = (output + data).slice(-4000);
    });
  server.on('error', (error) => {
    output += error.message;
  });
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Preview failed: ${output}`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return { url, server };
      } catch {
        /* The server is still starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Preview did not start: ${output}`);
  } catch (error) {
    server.kill();
    throw error;
  }
}
