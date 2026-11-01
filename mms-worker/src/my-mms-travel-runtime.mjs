const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAX_COORDINATE = 90;

/** Computes a traffic-aware driving ETA. Coordinates are used only in this request. */
export async function computeGoogleEtaMinutes({ latitude, longitude, destination, apiKey, fetchImpl = fetch }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const address = safeText(destination, 2000);
  const key = String(apiKey || "").trim();
  if (!Number.isFinite(lat) || Math.abs(lat) > MAX_COORDINATE || !Number.isFinite(lng) || Math.abs(lng) > 180) {
    throw travelError(400, "TRAVEL_LOCATION_INVALID");
  }
  if (!address) throw travelError(409, "TRAVEL_DESTINATION_UNAVAILABLE");
  if (!key) throw travelError(503, "GOOGLE_ROUTES_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(GOOGLE_ROUTES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: lat, longitude: lng } } },
        destination: { address },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw travelError(503, "GOOGLE_ROUTES_UNAVAILABLE");
    const seconds = Number.parseFloat(String(payload?.routes?.[0]?.duration || "").replace(/s$/, ""));
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400) throw travelError(503, "GOOGLE_ETA_UNAVAILABLE");
    return Math.max(1, Math.ceil(seconds / 60));
  } catch (error) {
    if (error?.name === "AbortError") throw travelError(503, "GOOGLE_ROUTES_TIMEOUT");
    if (error?.status) throw error;
    throw travelError(503, "GOOGLE_ROUTES_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export function numericEtaLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 1 || value > 1440) return null;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours && rest) return `${hours} ชม. ${rest} นาที`;
  if (hours) return `${hours} ชม.`;
  return `${rest} นาที`;
}

function safeText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function travelError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}
