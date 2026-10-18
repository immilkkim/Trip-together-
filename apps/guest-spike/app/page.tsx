'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, configured, messages, rpc } from '../lib/api';
import { initialDay, localDate, overlaps, validateInput, wallTimeToIso, type Event, type Member, type Trip } from '../lib/domain';

type Opened = { trip: Trip; members: Member[] };
type Identity = { guestToken: string; memberId: string; expiresAt: string; trip: Trip };
type Snapshot = { members: Member[]; events: Event[]; changeSeq: number };
const storageKey = 'tt-guest-spike-session-v1';
function errorText(e: unknown) { return e instanceof ApiError ? messages[e.code] ?? '未能完成，請稍後重試。' : e instanceof Error ? e.message : '未能完成操作'; }
export default function Page() {
  const [invite, setInvite] = useState('');
  const [opened, setOpened] = useState<Opened | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [day, setDay] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('11:00');
  const [selected, setSelected] = useState<string[]>([]);
  const pending = useRef<{ body: string; key: string } | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const refreshId = useRef(0);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if (fragment) { setInvite(fragment); window.history.replaceState(null, '', window.location.pathname); }
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Identity | null;
      if (value?.guestToken && value.trip?.timeZone && Date.parse(value.expiresAt) > Date.now()) {
        setIdentity(value); const d = initialDay(value.trip); setDay(d); setEndDate(d); setSelected([value.memberId]);
      } else sessionStorage.removeItem(storageKey);
    } catch { sessionStorage.removeItem(storageKey); }
  }, []);
  const refresh = useCallback(async () => {
    if (!identity || !day) return;
    const g = generation.current;
    const request = ++refreshId.current;
    try {
      const next = await rpc<Snapshot>('tt_guest_snapshot', { p_guest_token: identity.guestToken, p_date: day });
      if (g === generation.current && request === refreshId.current) setSnapshot(next);
    } catch (e) { if (g === generation.current && request === refreshId.current) setError(errorText(e)); }
  }, [identity, day]);
  useEffect(() => {
    generation.current++; setSnapshot(null); void refresh();
    const poll = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void refresh(); }, 15_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { generation.current++; clearInterval(poll); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  async function action(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(errorText(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  const open = () => action(async () => {
    setOpened(null);
    const data = await rpc<Opened>('tt_guest_open', { p_invite_token: invite.trim() }); setOpened(data);
  });
  const join = (member: Member) => action(async () => {
    if (!opened) return;
    const result = await rpc<Omit<Identity, 'trip'>>('tt_guest_join', { p_invite_token: invite.trim(), p_member_id: member.id });
    const value = { ...result, trip: opened.trip };
    sessionStorage.setItem(storageKey, JSON.stringify(value)); generation.current++;
    setIdentity(value); const date = initialDay(value.trip); setDay(date); setEndDate(date); setSelected([member.id]); setInvite(''); setOpened(null);
  });
  const leave = () => action(async () => {
    if (!identity) return;
    // Always clear this browser even if the session is already expired.
    try { await rpc('tt_guest_leave', { p_guest_token: identity.guestToken }); }
    finally { generation.current++; sessionStorage.removeItem(storageKey); setIdentity(null); setSnapshot(null); setTitle(''); setSelected([]); pending.current=null; }
  });
  const add = () => action(async () => {
    if (!identity) return;
    if (!navigator.onLine) throw Error('目前離線，活動尚未儲存。');
    const input = { title: title.trim(), startsAt: wallTimeToIso(day, startTime, identity.trip.timeZone), endsAt: wallTimeToIso(endDate, endTime, identity.trip.timeZone), timeZone: identity.trip.timeZone, memberIds: [...selected].sort() };
    validateInput(input);
    const body = JSON.stringify(input);
    if (!pending.current || pending.current.body !== body) pending.current = { body, key: crypto.randomUUID() };
    // Preview is advisory. Server rechecks the full canonical range under a trip lock.
    const previewConflict = snapshot?.events.some(event => overlaps(input, event));
    if (previewConflict) setNotice('目前畫面已有撞期，正在由伺服器確認。');
    await rpc('tt_guest_create_event', { p_guest_token: identity.guestToken, p_request_key: pending.current.key, p_request: input });
    pending.current=null; setTitle(''); setNotice('活動已儲存。'); await refresh();
  });
  const trip = identity?.trip;
  return <main>
    <header><div className="mark" aria-hidden="true">↗</div><div><strong>Trip Together</strong><p>{trip?.name ?? '獨立版 · 小型技術體驗'}</p></div>{identity && <button className="quiet" onClick={leave} disabled={busy}>切換名字</button>}</header>
    {!configured && <aside className="setup">尚未連接 Supabase 測試專案。此頁不會用示範儲存假裝已同步；請按 README 完成免費設定。</aside>}
    {error && <div role="alert" className="error">{error}</div>}
    {notice && <div role="status" className="notice">{notice}</div>}
    {!identity ? <section className="panel join"><span className="eyebrow">一起出發</span><h1>加入你的旅程</h1><p>輸入私人邀請碼，再選擇自己的名字。</p><form onSubmit={e => { e.preventDefault(); void open(); }}><label>邀請碼<input value={invite} onChange={e => { setInvite(e.target.value); setOpened(null); }} autoComplete="off" spellCheck={false} required /></label><button disabled={busy || !configured} type="submit">查看團友</button></form>{opened && <div className="member-list">{opened.members.map(m => <button className="member" key={m.id} onClick={() => join(m)} disabled={busy}>{m.name}{m.isLeader && <small>團長</small>}</button>)}</div>}<small>家庭試用模式：持有邀請碼的人可以選擇任何名字。</small></section> : <>
      <div className="heading"><div><span className="eyebrow">每日行程</span><h1>大家今日去邊度？</h1><p>{snapshot?.members.find(m => m.id===identity.memberId)?.name ?? '團友'} · {trip!.timeZone}</p></div><button className="quiet" disabled={busy} onClick={() => action(refresh)}>重新整理</button></div>
      <section className="panel"><label>查看日期<input type="date" min={trip!.startDate} max={trip!.endDate} value={day} onChange={e => { generation.current++; setDay(e.target.value); setEndDate(e.target.value); setError(''); }} /></label><p className="subtle">前景每 15 秒更新；切回此頁亦會更新。</p><div className="event-list">{snapshot ? snapshot.events.length ? snapshot.events.map(event => <article key={event.id}><p className="event-time">{new Intl.DateTimeFormat('zh-HK',{ timeZone:trip!.timeZone, hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(event.startsAt))} → {localDate(new Date(event.endsAt),trip!.timeZone)!==day ? `${localDate(new Date(event.endsAt),trip!.timeZone)} ` : ''}{new Intl.DateTimeFormat('zh-HK',{ timeZone:trip!.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(event.endsAt))}</p><h2>{event.title}</h2><div className="chips">{event.memberIds.map(id => <span key={id}>{snapshot.members.find(m=>m.id===id)?.name ?? '團友'}</span>)}</div></article>) : <p className="empty">這天還未有活動。</p> : <p>正在載入這天的行程…</p>}</div></section>
      <section className="panel"><h2>新增活動</h2><form onSubmit={e => { e.preventDefault(); void add(); }}><fieldset disabled={busy}><label>活動名稱<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：海港早餐" /></label><div className="fields"><label>開始時間<input required type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} /></label><label>結束日期<input required type="date" min={day} max={trip!.endDate} value={endDate} onChange={e=>setEndDate(e.target.value)} /></label><label>結束時間<input required type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} /></label></div><p className="subtle">開始日期為上方查看日期；時間以 {trip!.timeZone} 計。</p><legend>同行團友</legend><div className="checks">{snapshot?.members.map(m=><label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,m.id]:old.filter(id=>id!==m.id))}/>{m.name}</label>)}</div><button type="submit" disabled={!snapshot}>加入行程</button></fieldset></form></section>
    </>}
    <footer>目前只驗證加入旅程、新增活動、撞期與多人更新；完整時間軸、籃子及投票將逐步移植。</footer>
  </main>;
}
