/** Query scope shared by every Analytics card. `null` means "not ready yet — don't fetch". */
export interface AnalyticsScope {
  /** undefined = combined across all messes (Admins only; Data Collectors are always scoped server-side). */
  messId?: string;
  dateFrom?: string;
  dateTo?: string;
}
