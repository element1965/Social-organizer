// Cloudflare Worker: приём и выдача бэкапов Social Organizer в R2 (бакет social-organizer-backups).
// Агентский токен Cloudflare в инфраструктуру проекта не попадает: сервис бэкапа знает только INGEST_KEY.
//   PUT  /b/<name>   — загрузить файл (тело = дамп)
//   GET  /list       — список файлов (новые сверху)
//   GET  /b/<name>   — скачать файл (для восстановления)
// Ретенция: daily/* хранятся 35 дней, monthly/* — 400 дней (чистка при каждой загрузке).
export default {
  async fetch(req, env) {
    if (req.headers.get("authorization") !== `Bearer ${env.INGEST_KEY}`) return new Response("unauthorized", { status: 401 });
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/list") {
      const out = []; let cursor;
      do { const r = await env.BUCKET.list({ cursor }); out.push(...r.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded }))); cursor = r.truncated ? r.cursor : undefined; } while (cursor);
      out.sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
      return Response.json(out);
    }
    const key = url.pathname.startsWith("/b/") ? decodeURIComponent(url.pathname.slice(3)) : "";
    if (!/^(daily|monthly)\/[\w.-]+$/.test(key)) return new Response("bad key", { status: 400 });
    if (req.method === "PUT") {
      await env.BUCKET.put(key, req.body);
      const now = Date.now(); let cursor;
      do {
        const r = await env.BUCKET.list({ cursor });
        for (const o of r.objects) {
          const ageDays = (now - new Date(o.uploaded).getTime()) / 86400000;
          if ((o.key.startsWith("daily/") && ageDays > 35) || (o.key.startsWith("monthly/") && ageDays > 400)) await env.BUCKET.delete(o.key);
        }
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
      return new Response("ok");
    }
    if (req.method === "GET") {
      const obj = await env.BUCKET.get(key);
      return obj ? new Response(obj.body, { headers: { "content-type": "application/octet-stream" } }) : new Response("not found", { status: 404 });
    }
    return new Response("method", { status: 405 });
  },
};
