import { env } from "cloudflare:workers";
import { INVITE_TOKEN } from "@/lib/trip-secret";

function validKey(key: string) {
  return /^[0-9a-f-]+\.(jpg|png|webp)$/i.test(key);
}

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!validKey(key) || !env.BUCKET) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  if (request.headers.get("x-trip-invite") !== INVITE_TOKEN) {
    return Response.json({ error: "邀請連結無效或已失效" }, { status: 403 });
  }
  const { key } = await context.params;
  if (!validKey(key) || !env.BUCKET) {
    return Response.json({ error: "找不到相片" }, { status: 404 });
  }
  await env.BUCKET.delete(key);
  return Response.json({ ok: true });
}
