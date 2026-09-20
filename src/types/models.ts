export type Role = 'ADMIN' | 'DATA_COLLECTOR';
export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
export type WeekType = 'A' | 'B';
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';
export type EventType = 'NORMAL' | 'HOLIDAY' | 'FESTIVAL' | 'COLLEGE_EVENT' | 'EXAM_PERIOD';
export type QuantityUnit = 'KG' | 'LITRES';
export type MenuTag =
  | 'VEGETARIAN'
  | 'NON_VEGETARIAN'
  | 'FRIED'
  | 'GRAVY'
  | 'DRY'
  | 'RICE_BASED'
  | 'BREAD_BASED'
  | 'SPICY'
  | 'SWEET'
  | 'DESSERT';

export interface Mess {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  messId: string | null;
  mess?: { id: string; name: string; code: string } | null;
  createdAt?: string;
}

export interface MenuSlot {
  id: string;
  messId: string;
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  mealSlot: MealSlot;
  itemCount: number;
  pctGravyDishes: number;
  hasBiryani: boolean;
  hasPaneer: boolean;
  hasEggBreakfast: boolean;
  hasDessert: boolean;
  hasDosa: boolean;
  hasParatha: boolean;
  tags: MenuTag[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WasteRecord {
  id: string;
  messId: string;
  mess?: { id: string; name: string; code: string };
  date: string;
  mealSlot: MealSlot;
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  menuSlotId: string | null;
  menuSlot?: MenuSlot | null;
  plateWasteKg: number;
  counterWasteKg: number;
  packagingWasteKg: number;
  totalWasteKg: number;
  headcount: number;
  quantityPrepared: number;
  quantityUnit: QuantityUnit;
  totalIngredientCost: number;
  wastePerPerson: number;
  wastePercent: number;
  temperatureC: number | null;
  rainfallMm: number | null;
  eventType: EventType;
  scheduleDeviation: boolean;
  deviationReason: string | null;
  deviationDescription: string | null;
  tags: MenuTag[];
  notes: string | null;
  createdById: string;
  createdBy?: { id: string; name: string };
  updatedById: string | null;
  updatedBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrendPoint {
  bucket: string;
  label: string;
  recordCount: number;
  totalWasteKg: number;
  avgWasteKg: number;
  avgWastePerPerson: number;
  avgWastePercent: number;
  totalCost: number;
  totalHeadcount: number;
  totalQuantityPrepared: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  recordCount: number;
  totalWasteKg: number;
  avgWasteKg: number;
  avgWastePerPerson: number;
  avgWastePercent: number;
  totalCost: number;
  totalHeadcount: number;
  totalQuantityPrepared: number;
}

export interface KpiValue {
  valueKg?: number | null;
  valueRupees?: number | null;
  trendPct: number | null;
  comparedTo: string;
}

export interface SummaryResponse {
  asOfDate: string | null;
  totalWasteToday: KpiValue | null;
  wastePerPersonToday: KpiValue | null;
  costWastedToday: KpiValue | null;
  avgWeeklyWaste: KpiValue | null;
  message?: string;
}

export interface CompositionResponse {
  recordCount: number;
  totalWasteKg: number;
  composition: { key: string; label: string; valueKg: number; percent: number }[];
}

export interface Insight {
  type: 'day-pattern' | 'month-trend' | 'meal-pattern' | 'deviation-impact';
  message: string;
}

export interface HistoricalAverageResponse {
  messId: string;
  mealSlot: MealSlot;
  dayOfWeek: DayOfWeek;
  weekType: WeekType;
  sampleSize: number;
  averageTotalWasteKg: number | null;
  averageWastePerPerson: number | null;
  averageWastePercent: number | null;
  label: string;
}

export interface WeatherResponse {
  weather: {
    temperatureC: number | null;
    temperatureMaxC: number | null;
    temperatureMinC: number | null;
    rainfallMm: number | null;
    precipitationMm: number | null;
    humidityPercent: number | null;
    source: string;
  } | null;
  fromCache: boolean;
  fetchFailed: boolean;
}

// ---------------------------------------------------------------------------
// Phase 7b — Records / Analytics response shapes
// ---------------------------------------------------------------------------

export type SortDir = 'asc' | 'desc';
export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface TrendsResponse {
  granularity: Granularity;
  series: TrendPoint[];
  /** Only present when `splitByMess=true` was requested in the combined (all-mess) view. */
  byMess?: { messId: string; messName: string; series: TrendPoint[] }[];
}

export interface BreakdownResponse {
  by: 'mealSlot' | 'dayOfWeek' | 'weekType' | 'eventType';
  breakdown: BreakdownRow[];
}

export interface CorrelationPointData {
  date: string;
  messId: string;
  messName: string;
  mealSlot: string;
  x: number;
  y: number;
}

export interface CorrelationResponse {
  metric: 'quantityPrepared' | 'totalIngredientCost';
  xLabel: string;
  yLabel: string;
  correlation: number | null;
  sampleSize: number;
  points: CorrelationPointData[];
}

export interface AnomalyRow {
  id: string;
  date: string;
  messId: string;
  messName: string;
  mealSlot: string;
  dayOfWeek: string;
  weekType: string;
  totalWasteKg: number;
  wastePerPerson: number;
  wastePercent: number;
  eventType: string;
  scheduleDeviation: boolean;
  zScore: number;
  baselineAvgWastePercent: number;
}

export interface AnomaliesResponse {
  thresholdStdDev: number;
  count: number;
  anomalies: AnomalyRow[];
}

// ---------------------------------------------------------------------------
// Phase 7b part 2 — Users / Menu Management shapes
// ---------------------------------------------------------------------------

/** A user as returned by /api/users (Admin-only; never includes a password hash). */
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  messId: string | null;
  mess: { id: string; name: string; code: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCopyResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Phase 8 — Prediction / Notifications shapes
// ---------------------------------------------------------------------------

export type PredictionConfidence = 'low' | 'medium' | 'high';

export interface PredictionDriver {
  key: string;
  label: string;
  factor: number;
  /** Signed percentage effect on the base estimate: 1.12 -> +12. */
  impactPct: number;
  sampleSize: number;
}

export interface PredictionBaseline {
  tier: 'meal-day-week' | 'meal-day' | 'meal' | 'mess' | 'none';
  /** Human description of which past meals the base level came from. */
  label: string;
  sampleSize: number;
  avgWastePerPerson: number;
}

export interface Prediction {
  predictedWastePerPerson: number;
  predictedTotalWasteKg: number;
  rangeLowKg: number;
  rangeHighKg: number;
  expectedHeadcount: number;
  headcountSource: 'provided' | 'historical';
  baseline: PredictionBaseline;
  drivers: PredictionDriver[];
  confidence: PredictionConfidence;
  method: string;
}

export interface PredictResponse {
  messId: string;
  date: string;
  mealSlot: MealSlot;
  dayOfWeek: DayOfWeek;
  weekType: WeekType;
  eventType: EventType;
  historySize: number;
  scheduledMenu: { itemCount: number; pctGravyDishes: number } | null;
  /** Null when the mess has no usable history yet — not an error. */
  prediction: Prediction | null;
  message?: string;
}

export interface ForecastDay {
  date: string;
  dayOfWeek: DayOfWeek;
  label: string;
  predictedKg: number;
  rangeLowKg: number;
  rangeHighKg: number;
  eventType: EventType;
  eventName: string | null;
  byMeal: { mealSlot: MealSlot; label: string; predictedKg: number }[];
}

export interface ForecastResponse {
  startDate: string | null;
  anchorDate: string | null;
  days: number;
  totalPredictedKg: number;
  avgPerDayKg: number;
  confidence: PredictionConfidence;
  daily: ForecastDay[];
  byMess: { messId: string; messName: string; predictedKg: number }[];
  message?: string;
}

export type NotificationType =
  | 'high-waste'
  | 'missing-entry'
  | 'trend-improvement'
  | 'trend-regression';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  date: string;
  messId: string | null;
  messName: string | null;
  href: string | null;
}

export interface NotificationsResponse {
  asOfDate: string | null;
  count: number;
  notifications: AppNotification[];
}
