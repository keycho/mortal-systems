/** compact badge text for the toolbar: minutes under an hour, hours under a day, else days */
export function badgeText(remainingMs: number | null): string {
  if (remainingMs === null) return "";
  if (remainingMs <= 0) return "0m";
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
