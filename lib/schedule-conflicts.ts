import type { ItineraryItem } from "./trip-data";

export type ScheduleConflict = { item: ItineraryItem; memberIds: string[] };
type ScheduleRange = Pick<ItineraryItem, "date" | "time" | "endTime" | "endDate">;
export type DailyItineraryItem = ItineraryItem & { continuesFromPreviousDay: boolean; continuesToNextDay: boolean };

export function addCalendarDays(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function effectiveEndDate(range: ScheduleRange): string {
  return range.endDate || (range.endTime <= range.time ? addCalendarDays(range.date, 1) : range.date);
}

export function shiftEndDate(oldStart: string, newStart: string, endDate: string): string {
  if (!endDate || !oldStart || !newStart) return "";
  const days = (Date.parse(`${newStart}T12:00:00Z`) - Date.parse(`${oldStart}T12:00:00Z`)) / 86400000;
  return Number.isFinite(days) ? addCalendarDays(endDate, days) : "";
}

export function validScheduleRange(range: ScheduleRange, trip?: { startDate: string; endDate: string }): boolean {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && addCalendarDays(date, 0) === date;
  const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const endDate = effectiveEndDate(range);
  return validDate(range.date) && validDate(endDate) && validTime(range.time) && validTime(range.endTime)
    && `${range.date}T${range.time}` < `${endDate}T${range.endTime}`
    && (!trip || (range.date >= trip.startDate && endDate <= trip.endDate));
}

export function scheduleRangeLabel(range: ScheduleRange): string {
  const endDate = effectiveEndDate(range);
  return `${range.date} ${range.time}–${endDate !== range.date ? `${endDate} ` : ""}${range.endTime}`;
}

export function itineraryForDay(items: ItineraryItem[], date: string): DailyItineraryItem[] {
  const dayStart = `${date}T00:00`;
  const dayEnd = `${addCalendarDays(date, 1)}T00:00`;
  return items.flatMap((item) => {
    const start = `${item.date}T${item.time}`;
    const end = `${effectiveEndDate(item)}T${item.endTime}`;
    if (start >= dayEnd || end <= dayStart) return [];
    return [{ ...item, date, endDate: date, time: start < dayStart ? "00:00" : item.time, endTime: end >= dayEnd ? "24:00" : item.endTime,
      continuesFromPreviousDay: start < dayStart, continuesToNextDay: end > dayEnd }];
  });
}

export function findScheduleConflicts(items: ItineraryItem[], candidate: ScheduleRange & Pick<ItineraryItem, "id" | "memberIds">): ScheduleConflict[] {
  const start = `${candidate.date}T${candidate.time}`;
  const end = `${effectiveEndDate(candidate)}T${candidate.endTime}`;
  return items.flatMap((item) => {
    if (item.id === candidate.id || `${item.date}T${item.time}` >= end || `${effectiveEndDate(item)}T${item.endTime}` <= start) return [];
    const memberIds = [...new Set(candidate.memberIds.filter((id) => item.memberIds.includes(id)))];
    return memberIds.length ? [{ item, memberIds }] : [];
  });
}

// Existing conflicts must not prevent unrelated edits or removal of old cards.
export function findChangedScheduleConflicts(previous: ItineraryItem[], next: ItineraryItem[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const seen = new Set<string>();
  for (const item of next) {
    const old = previous.find((value) => value.id === item.id);
    if (old && old.date === item.date && effectiveEndDate(old) === effectiveEndDate(item) && old.time === item.time && old.endTime === item.endTime && [...old.memberIds].sort().join(",") === [...item.memberIds].sort().join(",")) continue;
    for (const conflict of findScheduleConflicts(next, item)) {
      const key = [item.id, conflict.item.id].sort().join("\0");
      if (!seen.has(key)) {
        conflicts.push(conflict);
        seen.add(key);
      }
    }
  }
  return conflicts;
}
