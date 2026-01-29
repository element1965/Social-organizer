import express from 'express';
import Gun from 'gun';
import { createServer } from 'http';

const app = express();
const port = process.env.PORT || 8765;

app.use(Gun.serve);
app.use(express.static('public'));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'social-organizer-relay' });
});

const server = createServer(app);

Gun({ web: server, file: 'gun-data' });

server.listen(port, () => {
  console.log(`Gun relay running on http://localhost:${port}/gun`);
});
