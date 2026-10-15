import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/** Socket.io under /api/socket.io (so the same proxy and origin rules apply as for REST). */
export class SocketAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      path: '/api/socket.io',
      cors: { origin: this.origins, credentials: true },
      // Payloads are small JSON events; anything bigger is a misuse.
      maxHttpBufferSize: 64 * 1024,
    });
  }
}
