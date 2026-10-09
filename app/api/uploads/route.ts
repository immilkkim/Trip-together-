import { env } from "cloudflare:workers";
import { INVITE_TOKEN } from "@/lib/trip-secret";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function authorized(request: Request) {
  return request.headers.get("x-trip-invite") === INVITE_TOKEN;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "邀請連結無效或已失效" }, { status: 403 });
  }
  if (!env.BUCKET) {
    return Response.json({ error: "相片儲存服務暫時未能使用" }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return Response.json({ error: "請選擇相片" }, { status: 400 });
    }
    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension) {
      return Response.json({ error: "只支援 JPG、PNG 或 WebP 相片" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "相片不可大於 5 MB" }, { status: 400 });
    }

    const key = `${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 180) },
    });
    return Response.json({ key, url: `/api/uploads/${key}` });
  } catch {
    return Response.json({ error: "相片上載失敗，請稍後再試" }, { status: 500 });
  }
}
