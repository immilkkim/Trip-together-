export type Member = { id: string; name: string; isLeader: boolean };
export type Trip = { id: string; name: string; startDate: string; endDate: string; timeZone: string; changeSeq: number };
export type Event = { id: string; title: string; startsAt: string; endsAt: string; timeZone: string; memberIds: string[]; version: number };
export type EventInput = Omit<Event, 'id' | 'version'>;
export function overlaps(a: EventInput, b: EventInput): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
    && a.memberIds.some(id => b.memberIds.includes(id));
}
export function localDate(instant: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (name: string) => p.find(x => x.type === name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function initialDay(trip: Trip, now = new Date()): string {
  const today = localDate(now, trip.timeZone);
  return today < trip.startDate ? trip.startDate : today > trip.endDate ? trip.endDate : today;
}
// Resolve a wall-clock input in an IANA zone without relying on the phone's zone.
// This bounded spike rejects ambiguous/nonexistent local times rather than guessing.
export function wallTimeToIso(date: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('日期或時間格式不正確');
  const target = `${date}T${time}:00`;
  const wall = Date.parse(`${target}Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0,19) !== target) throw Error('日期不正確');
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const matches: number[] = [];
  // All present-day IANA offsets are multiples of 15 minutes, within +/-14h.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = wall - offset * 60_000;
    const p = f.formatToParts(instant);
    const get = (type: string) => p.find(x => x.type === type)!.value;
    if (`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}` === target) matches.push(instant);
  }
  if (matches.length !== 1) throw Error('此本地時間不存在或因夏令時間重複，請選其他時間');
  return new Date(matches[0]).toISOString();
}
export function validateInput(input: EventInput): void {
  if (!input.title.trim() || input.title.trim().length > 200 || !input.memberIds.length || !Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.endsAt)) || Date.parse(input.startsAt) >= Date.parse(input.endsAt)) throw Error('請輸入名稱、正確起訖時間及至少一位同行者');
}
