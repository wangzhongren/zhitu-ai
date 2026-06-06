const express = require('express');
const routes = require('./routes.cjs');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS for Electron renderer (localhost dev and file://)
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', '*');
    next();
  });

  app.use(routes);

  return app;
}

function startServer(port = 18674) {
  return new Promise((resolve, reject) => {
    const app = createApp();
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`[server] Express running on http://127.0.0.1:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { createApp, startServer };
