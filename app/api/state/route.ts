import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tripStates } from "@/db/schema";
import { initialTripState, type TripState } from "@/lib/trip-data";
import { INVITE_TOKEN } from "@/lib/trip-secret";
import { findChangedScheduleConflicts, validScheduleRange } from "@/lib/schedule-conflicts";

const TRIP_ID = "demo-trip";

function authorized(request: Request) {
  return request.headers.get("x-trip-invite") === INVITE_TOKEN;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "邀請連結無效或已失效" }, { status: 403 });
  }

  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(tripStates)
      .where(eq(tripStates.tripId, TRIP_ID))
      .limit(1);

    if (existing) {
      return Response.json({ state: JSON.parse(existing.payload), revision: existing.revision });
    }

    const now = new Date().toISOString();
    await db.insert(tripStates).values({
      tripId: TRIP_ID,
      payload: JSON.stringify(initialTripState),
      revision: 1,
      updatedAt: now,
    });
    return Response.json({ state: initialTripState, revision: 1 });
  } catch {
    return Response.json({ state: initialTripState, revision: 0, demo: true });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "邀請連結無效或已失效" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { state?: TripState; revision?: number };
    if (!body.state?.trip || !Array.isArray(body.state.members) || !Array.isArray(body.state.itinerary)) {
      return Response.json({ error: "行程資料格式不正確" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db.select().from(tripStates).where(eq(tripStates.tripId, TRIP_ID)).limit(1);
    if (!Number.isInteger(body.revision) || body.revision !== (existing?.revision ?? 0)) {
      return Response.json({ error: "其他團友已更新行程，已重新載入，請再試一次", code: "stale_revision" }, { status: 409 });
    }
    const previous = existing ? JSON.parse(existing.payload) as TripState : initialTripState;
    if (body.state.itinerary.some((item) => !validScheduleRange(item, body.state!.trip))) {
      return Response.json({ error: "活動的開始及結束日期／時間不正確，或超出旅程範圍" }, { status: 400 });
    }
    const conflicts = findChangedScheduleConflicts(previous.itinerary, body.state.itinerary);
    if (conflicts.length) {
      return Response.json({ error: "同行成員已有重疊活動，請先調整日期、時間或成員", code: "schedule_conflict", conflicts }, { status: 409 });
    }
    const nextRevision = (existing?.revision ?? 0) + 1;
    const values = {
        tripId: TRIP_ID,
        payload: JSON.stringify(body.state),
        revision: nextRevision,
        updatedAt: new Date().toISOString(),
    };
    const written = existing
      ? await db.update(tripStates).set(values).where(and(eq(tripStates.tripId, TRIP_ID), eq(tripStates.revision, existing.revision))).returning({ revision: tripStates.revision })
      : await db.insert(tripStates).values(values).onConflictDoNothing().returning({ revision: tripStates.revision });
    if (!written.length) return Response.json({ error: "其他團友剛更新了行程，已重新載入，請再試一次", code: "stale_revision" }, { status: 409 });

    return Response.json({ ok: true, revision: nextRevision });
  } catch {
    return Response.json({ error: "暫時未能儲存，請稍後再試" }, { status: 500 });
  }
}
