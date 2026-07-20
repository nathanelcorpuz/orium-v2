import { loadForecast } from "@/lib/forecastData";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage() {
  const { forecast, balances, currency, balanceRanges } = await loadForecast();

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
      currency={currency}
      balanceRanges={balanceRanges}
    />
  );
}
