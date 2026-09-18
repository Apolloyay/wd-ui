import type { Coordinates } from './geolocation';

/**
 * OpenStreetMap Nominatim's free reverse-geocoding endpoint -- no API key,
 * and (unlike BigDataCloud's free tier, which only resolves to city/region)
 * it returns real street-level address components. Their usage policy caps
 * the public instance at 1 request/second and asks non-browser clients to
 * identify themselves via User-Agent (browsers can't set that header, so it
 * only takes effect on native); attribute results to "OpenStreetMap
 * contributors" wherever they're shown. Fine for this app's volume -- at
 * most one call per new entry -- but verify against current docs before
 * relying on it further, see AGENTS.md.
 */
export async function reverseGeocode(coords: Coordinates, language: string): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=jsonv2&addressdetails=1&zoom=18&accept-language=${encodeURIComponent(language)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'WeDiaryApp/1.0 (personal diary app)' } });
    if (!res.ok) return null;
    const data = await res.json();
    return formatAddress(data.address ?? {}) ?? (typeof data.display_name === 'string' ? data.display_name : null);
  } catch {
    return null;
  }
}

/** Builds "123 Main St, Seattle, Washington, United States" from Nominatim's address components. */
function formatAddress(address: Record<string, string | undefined>): string | null {
  const street = [address.house_number, address.road].filter(Boolean).join(' ');
  const locality = address.city || address.town || address.village || address.suburb;
  const parts = [street, locality, address.state, address.country].filter((part): part is string => !!part);
  return parts.length ? parts.join(', ') : null;
}
