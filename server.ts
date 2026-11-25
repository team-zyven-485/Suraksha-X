// Must be the first import: loads .env before the server modules below read it.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { buildApp } from './server/app';

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await buildApp();

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // The service worker must never be cached by the browser, or app updates
    // would never reach installed devices.
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'sw.js'));
    });
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SURAKSHA-X] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
