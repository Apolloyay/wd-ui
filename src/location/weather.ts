import type { EntryWeather } from '../types/entry';
import type { Coordinates } from './geolocation';

// Open-Meteo: free, no API key for non-commercial use (10,000 calls/day).
// /forecast gives "current" conditions; the separate archive host covers any
// date that isn't today (a backdated entry, or an old entry edited later).
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** forDate is a YYYY-MM-DD (the entry's own date), not necessarily today. */
export async function fetchWeather(coords: Coordinates, forDate: string): Promise<EntryWeather | null> {
  try {
    const isToday = forDate === new Date().toISOString().slice(0, 10);
    return isToday ? await fetchCurrent(coords, forDate) : await fetchHistorical(coords, forDate);
  } catch {
    return null;
  }
}

async function fetchCurrent(coords: Coordinates, forDate: string): Promise<EntryWeather | null> {
  const url = `${FORECAST_URL}?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const temperatureC = data.current?.temperature_2m;
  const weatherCode = data.current?.weather_code;
  if (typeof temperatureC !== 'number' || typeof weatherCode !== 'number') return null;
  return { temperatureC, weatherCode, forDate };
}

async function fetchHistorical(coords: Coordinates, forDate: string): Promise<EntryWeather | null> {
  const url = `${ARCHIVE_URL}?latitude=${coords.latitude}&longitude=${coords.longitude}&start_date=${forDate}&end_date=${forDate}&daily=temperature_2m_mean,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const temperatureC = data.daily?.temperature_2m_mean?.[0];
  const weatherCode = data.daily?.weather_code?.[0];
  if (typeof temperatureC !== 'number' || typeof weatherCode !== 'number') return null;
  return { temperatureC, weatherCode, forDate };
}

/** WMO weather codes (shared by Open-Meteo's current & archive APIs) mapped to a display icon. */
export function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
