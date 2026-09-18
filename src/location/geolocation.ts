import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Returns null if permission was denied or the device couldn't get a fix --
 * callers treat that as "skip silently", never as an error to surface, since
 * location is always an optional add-on to an entry.
 */
export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  // Above Balanced, expo-location's web shim sets enableHighAccuracy: true,
  // which prefers GPS over coarser network/IP-based positioning.
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
