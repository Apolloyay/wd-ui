/**
 * A user-named location (e.g. "Home", "Work") saved once and then reused to
 * tag entries without repeating a GPS lookup or reverse-geocode every time.
 */
export interface SavedPlace {
  id: string;
  /** user-given nickname, e.g. "Home" -- shown in pickers */
  label: string;
  /** the actual reverse-geocoded street address at the time this place was saved */
  address: string;
  latitude: number;
  longitude: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
