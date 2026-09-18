/**
 * A diary book — a named container that entries belong to (e.g. "Personal",
 * "Travel 2026"). Tags are applied to entries, not to books.
 */
export interface DiaryBook {
  id: string;
  name: string;
  /** excluded from the default book list/search until "show hidden" is on */
  hidden: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
