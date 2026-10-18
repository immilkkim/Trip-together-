export class ApiError extends Error {
  constructor(public code: string, public details?: unknown) { super(code); }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('REPLACE_ME') && !key.startsWith('sb_secret_'));
export async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  if (!configured) throw new ApiError('NOT_CONFIGURED');
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key!, 'Content-Type': 'application/json' },
    body: JSON.stringify(params), cache: 'no-store', signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.message ?? 'SERVICE_UNAVAILABLE', body.details);
  return body as T;
}
export const messages: Record<string, string> = {
  NOT_CONFIGURED: '尚未連接測試資料庫。請先完成 README 的免費設定。',
  INVALID_INVITE: '邀請碼不正確、已撤銷或到期。', SESSION_EXPIRED: '訪客身份已到期或邀請已撤銷，請重新加入。',
  SCHEDULE_CONFLICT: '同行者已有撞期活動，請修改時間或同行名單。', INVALID_MEMBERS: '同行名單不正確。',
  OUTSIDE_TRIP_RANGE: '活動超出旅程日期範圍。', IDEMPOTENCY_KEY_REUSED: '重試識別碼與內容不一致，請重新操作。',
  INVALID_RANGE: '開始及結束時間不正確。', INVALID_TITLE: '活動名稱需為 1 至 200 字。',
  INVALID_TIME_ZONE: '活動時區不正確。', TOO_MANY_SESSIONS: '此名字的訪客裝置已達測試上限，請團長清理舊身份。',
};
