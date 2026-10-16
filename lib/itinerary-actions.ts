import type { Activity, ItineraryItem, TripState } from "./trip-data";

// Move the edited card and its basket entry in one shared-state update.
export function moveItineraryToBasket(state: TripState, item: ItineraryItem, city: Activity["city"], actorId: string, newActivityId: string): TripState {
  const original = state.itinerary.find((value) => value.id === item.id);
  const actor = state.members.find((value) => value.id === actorId);
  if (!original || !actor || !(actor.isLeader || original.memberIds.includes(actorId))) return state;

  const source = state.activities.find((value) => value.id === original.sourceActivityId);
  // Invitations are withdrawn below, so an invited editor needs their own copy
  // to retain editing access after the move.
  const canReuseSource = source && (actor.isLeader || source.createdBy === actorId);
  const names = item.memberIds.map((id) => state.members.find((member) => member.id === id)?.name ?? id);
  const activity: Activity = {
    ...(source ?? {}),
    id: canReuseSource ? source.id : newActivityId,
    city,
    category: source?.category ?? "自訂活動",
    title: item.title,
    area: item.place,
    description: [item.description, `原行程：${item.date} ${item.time}–${item.endDate && item.endDate !== item.date ? `${item.endDate} ` : ""}${item.endTime}`, `原同行者：${names.join("、") || "待選"}`, item.contact ? `聯絡資料：${item.contact}` : ""].filter(Boolean).join("\n\n"),
    hours: source?.hours ?? "時間待確認",
    travel: item.transport,
    walking: source?.walking ?? "適中",
    image: source?.image ?? "",
    imageAlt: source?.imageAlt ?? "",
    sourceUrl: source?.sourceUrl ?? (/^https?:\/\/\S+$/i.test(item.contact ?? "") ? item.contact! : ""),
    imageCredit: source?.imageCredit ?? "",
    imageSourceUrl: source?.imageSourceUrl ?? "",
    createdBy: canReuseSource ? source.createdBy ?? actorId : actorId,
    proposedDate: item.date,
    proposedEndDate: item.endDate ?? item.date,
    startTime: item.time,
    endTime: item.endTime,
  };

  return {
    ...state,
    itinerary: state.itinerary.filter((value) => value.id !== item.id),
    activities: [...state.activities.filter((value) => value.id !== activity.id), activity],
    // Withdraw only the invitation/result that published this card.
    proposals: state.proposals.filter((proposal) => proposal.publishedItineraryId !== item.id && !(proposal.status === "published" && !proposal.publishedItineraryId && proposal.activityId === original.sourceActivityId)),
  };
}
