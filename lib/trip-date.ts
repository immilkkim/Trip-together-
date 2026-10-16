type TripDateRange = { startDate: string; endDate: string; timeZone?: string };

export function tripLocalDate(trip: Pick<TripDateRange, "timeZone">, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: trip.timeZone ?? "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function defaultTripDate(trip: TripDateRange, now = new Date()): string {
  const today = tripLocalDate(trip, now);
  if (today < trip.startDate) return trip.startDate;
  if (today > trip.endDate) return trip.endDate;
  return today;
}
