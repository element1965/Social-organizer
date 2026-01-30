import express from 'express';
import Gun from 'gun';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8765;

app.use(Gun.serve);

// Serve built client (production)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback — all non-API routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = createServer(app);

Gun({ web: server, file: 'gun-data' });

server.listen(port, () => {
  console.log(`Gun relay running on http://localhost:${port}/gun`);
});
