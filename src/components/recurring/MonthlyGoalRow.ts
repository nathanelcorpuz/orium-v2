import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";

export type MonthlyGoalRow = {
  id: string;
  name: string;
  amount: number;
  start_date: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: RecurrenceEndsType;
  end_date: string | null;
  occurrence_count: number | null;
  comments: string | null;
};
