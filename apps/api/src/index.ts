import dotenv from 'dotenv';

// In development, `.env` should win over stray exports in your shell (e.g. a mistyped STRIPE_SECRET_KEY).
// In production, platform-provided env vars take precedence.
dotenv.config({ override: process.env.NODE_ENV !== 'production' });

import { createServer } from 'node:http';

import { app } from './app.js';
import { initSocket } from './socket.js';

const PORT = Number(process.env.PORT) || 3000;
const corsOrigin = process.env.CORS_ORIGIN ?? '*';

const httpServer = createServer(app);
initSocket(httpServer, corsOrigin);

httpServer.listen(PORT, () => {
  console.log(`JO Transportation API listening on http://localhost:${PORT}`);
});
