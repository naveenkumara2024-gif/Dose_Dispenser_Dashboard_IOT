export type DoseStatus = "PENDING" | "DISPENSED" | "CONFIRMED_TAKEN" | "MISSED";

export type AlertType =
  | "LOW_STOCK"
  | "MISSED_DOSE"
  | "STORAGE_CONDITION"
  | "DEVICE_OFFLINE";

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
  compartmentNo: number;
  createdAt: string;
};

export type ScheduleWithMedication = {
  id: string;
  medicationId: string;
  time: string;
  frequency: string;
  dayOfWeek: number | null;
  active: boolean;
  createdAt: string;
  medication: Medication;
};

// Creates a brand-new medication + its first dose time.
export type ScheduleFormValues = {
  name: string;
  dosage: string;
  compartmentNo: number;
  time: string;
  frequency: "daily" | "weekly";
  dayOfWeek: number | null;
};

// A single dose time — used both for adding another time to an existing medication and
// for editing one that already exists. No medication fields: there's one Medication row
// per drug, edited separately (see MedicationFormValues), not duplicated per time.
export type ScheduleTimeFormValues = {
  time: string;
  frequency: "daily" | "weekly";
  dayOfWeek: number | null;
};

// A medication's own fields, edited independently of any particular dose time.
export type MedicationFormValues = {
  name: string;
  dosage: string;
  compartmentNo: number;
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
  lastUpdated: string | null;
  lowStock: boolean;
  history: StockHistoryPoint[];
};

export type DashboardData = {
  todaysDoses: TodaysDose[];
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
