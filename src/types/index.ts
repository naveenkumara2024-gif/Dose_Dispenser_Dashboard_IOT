export type DoseStatus = "PENDING" | "DISPENSED" | "CONFIRMED_TAKEN" | "MISSED";

export type AlertType =
  | "LOW_STOCK"
  | "MISSED_DOSE"
  | "STORAGE_CONDITION"
  | "DEVICE_OFFLINE"
  | "DEVICE_TILTED"
  | "DISPENSE_FAILED";

export type TodaysDose = {
  scheduleId: string;
  time: string;
  frequency: string;
  medicationName: string;
  dosage: string;
  compartmentNo: number;
  status: DoseStatus;
};

export type ActiveAlert = {
  id: string;
  type: AlertType;
  message: string;
  resolved: boolean;
  createdAt: string;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  createdAt: string;
};

export const COMPARTMENT_COUNT = 5;

export type ScheduleWithMedication = {
  id: string;
  medicationId: string;
  time: string;
  frequency: string;
  dayOfWeek: number | null;
  compartmentNo: number;
  endDate: string | null;
  active: boolean;
  createdAt: string;
  medication: Medication;
};

// Creates a brand-new medication + its first dose time.
export type ScheduleFormValues = {
  name: string;
  dosage: string;
} & ScheduleTimeFormValues;

// A single dose time (with its compartment and optional end date) — used both for adding another time to an existing medication and
// for editing one that already exists. No medication fields: there's one Medication row
// per drug, edited separately (see MedicationFormValues), not duplicated per time.
export type ScheduleTimeFormValues = {
  time: string;
  frequency: "daily" | "weekly";
  dayOfWeek: number | null;
  compartmentNo: number;
  endDate: string | null;
};

// A medication's own fields, edited independently of any particular dose time.
export type MedicationFormValues = {
  name: string;
  dosage: string;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type FieldErrors = Record<string, string[] | undefined>;

export type AlertRow = {
  id: string;
  type: AlertType;
  message: string;
  dedupeKey: string | null;
  resolved: boolean;
  createdAt: string;
};

export type AlertsResponse = {
  alerts: AlertRow[];
  total: number;
  limit: number;
  offset: number;
};

export const ALERT_LABELS: Record<AlertType, string> = {
  LOW_STOCK: "Low stock",
  MISSED_DOSE: "Missed dose",
  STORAGE_CONDITION: "Storage condition",
  DEVICE_OFFLINE: "Device offline",
  DEVICE_TILTED: "Device tilted",
  DISPENSE_FAILED: "Dispense failed",
};

export type HistoryLog = {
  id: string;
  status: DoseStatus;
  timestamp: string;
  scheduleId: string;
  scheduledTime: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  compartmentNo: number;
};

export type HistoryResponse = {
  logs: HistoryLog[];
  total: number;
  limit: number;
  offset: number;
};

export type HistoryFilterState = {
  status: string;
  medicationId: string;
  from: string;
  to: string;
};

export type StockHistoryPoint = {
  weight: number;
  timestamp: string;
};

export type StockRow = {
  compartmentNo: number;
  medicationName: string | null;
  weight: number | null;
  percent: number | null;
  lastUpdated: string | null;
  lowStock: boolean;
  history: StockHistoryPoint[];
};

export type DashboardCompartment = {
  compartmentNo: number;
  medicationName: string;
  dosage: string;
  time: string;
  dueToday: boolean;
};

export type DashboardData = {
  nowMinutes: number;
  todaysDoses: TodaysDose[];
  compartments: DashboardCompartment[];
  adherence: {
    pct: number | null;
    confirmed: number;
    dispensed: number;
    windowDays: number;
  };
  activeAlerts: ActiveAlert[];
  activeAlertCount: number;
  device: {
    online: boolean;
    lastSeenAt: string | null;
  };
};

// GET /api/sensors (prompt 16).
export type DeviceEventType =
  | "PRESENCE_DETECTED"
  | "NO_PRESENCE"
  | "REMINDER"
  | "SERVO_ROTATED"
  | "PILL_DROP"
  | "NO_DROP"
  | "KNOCK"
  | "SHAKE";

export type DeviceEvent = {
  id: string;
  type: DeviceEventType;
  detail: string | null;
  timestamp: string;
};

export type SensorRange = "1h" | "24h" | "7d";

export type SensorStatus = "ok" | "warning" | "stale" | "offline" | "no_data";

export type SensorInfo = {
  key: string;
  name: string;
  part: string;
  status: SensorStatus;
  lastValue: string | null;
  detail: string;
  lastSeenAt: string | null;
};

export type EnvironmentReading = {
  temperature: number;
  humidity: number;
  alert: boolean;
  timestamp: string;
};

type MinMaxAvg = { min: number | null; max: number | null; avg: number | null };
type SafeBand = { min: number; max: number };

export type TiltEvent = {
  id: string;
  tilted: boolean;
  timestamp: string;
};

export type SensorsResponse = {
  range: SensorRange;
  generatedAt: string;
  device: { online: boolean; lastSeenAt: string | null; rssi: number | null };
  sensors: SensorInfo[];
  environment: {
    safeRange: { temperature: SafeBand; humidity: SafeBand };
    latest: (EnvironmentReading & { id: string }) | null;
    readings: EnvironmentReading[];
    stats: {
      count: number;
      outOfRangeCount: number;
      temperature: MinMaxAvg;
      humidity: MinMaxAvg;
    } | null;
  };
  tilt: { tilted: boolean | null; events: TiltEvent[] };
  activity: DeviceEvent[];
  // The device has one load cell (prompt 18).
  loadCell: {
    weight: number;
    percent: number | null;
    lastUpdated: string;
    lowStock: boolean;
  } | null;
};
