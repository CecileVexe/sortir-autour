export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle ("as the crow flies") distance in km, haversine formula. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Bounding box enclosing the circle of `radiusKm` around `center`. */
export function boundingBox(center: LatLon, radiusKm: number): BoundingBox {
  const dLat = radiusKm / 111.32;
  const cos = Math.max(0.01, Math.cos(toRad(center.lat)));
  const dLon = radiusKm / (111.32 * cos);
  return {
    south: Math.max(-90, center.lat - dLat),
    north: Math.min(90, center.lat + dLat),
    west: Math.max(-180, center.lon - dLon),
    east: Math.min(180, center.lon + dLon),
  };
}

export function isValidLatLon(p: Partial<LatLon> | null | undefined): p is LatLon {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lon === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180 &&
    !(p.lat === 0 && p.lon === 0)
  );
}

/** Keeps items whose location is within `radiusKm` of `origin`, and annotates their distance. */
export function filterByRadius<T extends { location: LatLon; distanceKm: number | null }>(
  items: readonly T[],
  origin: LatLon,
  radiusKm: number,
): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (!isValidLatLon(it.location)) continue;
    const d = haversineKm(origin, it.location);
    if (d <= radiusKm) out.push({ ...it, distanceKm: d });
  }
  return out;
}

/** Rounds coordinates to build cache keys that are shared by nearby searches (~1.1 km grid at 2 decimals). */
export function gridKey(p: LatLon, decimals = 2): string {
  return `${p.lat.toFixed(decimals)},${p.lon.toFixed(decimals)}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}
