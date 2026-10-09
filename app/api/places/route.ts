import { INVITE_TOKEN } from "@/lib/trip-secret";

type NominatimPlace = {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
};

function authorized(request: Request) {
  return request.headers.get("x-trip-invite") === INVITE_TOKEN;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "邀請連結無效或已失效" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const city = url.searchParams.get("city")?.trim() ?? "";
  if (query.length < 2) {
    return Response.json({ error: "請輸入至少兩個字" }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: `${query}${city && city !== "全部" ? `, ${city}, Australia` : ", Australia"}`,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    "accept-language": "zh-Hant,en",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        "User-Agent": "TripTogether/1.0 (small-group travel planner)",
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error("Place search unavailable");
    const rows = (await response.json()) as NominatimPlace[];
    return Response.json({
      places: rows.map((place) => ({
        id: String(place.place_id),
        name: place.name || place.display_name.split(",")[0],
        address: place.display_name,
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        category: place.type || place.category || "地點",
      })),
      attribution: "© OpenStreetMap contributors",
    }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "免費地點搜尋暫時繁忙，請稍後再試" }, { status: 503 });
  }
}
