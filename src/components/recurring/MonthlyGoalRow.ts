export type MonthlyGoalRow = {
  id: string;
  name: string;
  amount: number;
  day_of_month: number | null;
  start_date: string;
  end_date: string;
  comments: string | null;
};
