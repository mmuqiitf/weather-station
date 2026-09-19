const formatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatWib(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return `${formatter.format(new Date(iso))} WIB`;
}
