import { describe, it, expect, afterEach } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import { startServer } from '../src/index';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (stop) await stop();
  stop = null;
});

describe('server smoke', () => {
  it('accepts a socket connection', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const c: Socket = ioc(`http://localhost:${port}`);
    await new Promise<void>((resolve) => c.on('connect', () => resolve()));
    expect(c.connected).toBe(true);
    c.close();
  });
});
