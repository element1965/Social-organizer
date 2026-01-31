import Fastify from 'fastify';

const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`API server running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
