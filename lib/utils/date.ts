import { format } from "date-fns";

export function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function formatBR(d: Date) {
  return format(d, "dd/MM/yyyy");
}
