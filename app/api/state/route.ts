import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tripStates } from "@/db/schema";
import { initialTripState, type TripState } from "@/lib/trip-data";
import { INVITE_TOKEN } from "@/lib/trip-secret";

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
    const nextRevision = Math.max(1, Number(body.revision ?? 0) + 1);
    await db
      .insert(tripStates)
      .values({
        tripId: TRIP_ID,
        payload: JSON.stringify(body.state),
        revision: nextRevision,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: tripStates.tripId,
        set: {
          payload: JSON.stringify(body.state),
          revision: nextRevision,
          updatedAt: new Date().toISOString(),
        },
      });

    return Response.json({ ok: true, revision: nextRevision });
  } catch {
    return Response.json({ error: "暫時未能儲存，請稍後再試" }, { status: 500 });
  }
}
