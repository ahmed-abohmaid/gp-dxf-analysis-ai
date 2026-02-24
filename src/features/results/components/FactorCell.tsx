import { Dash } from "./Dash";

export function FactorCell({ value }: { value: number | null }) {
  if (value !== null) return <>{value.toFixed(2)}</>;
  return <Dash />;
}
