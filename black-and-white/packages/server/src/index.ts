import { createServer } from 'node:http';
import { Server } from 'socket.io';

export async function startServer(port: number): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    // 事件在后续任务接入
    void socket;
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        http.close(() => resolve());
      }),
  };
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith('index.ts')) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
