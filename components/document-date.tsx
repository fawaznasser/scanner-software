export default function DocumentDate({ createdAt, fallback }: { createdAt?: string; fallback: string }) {
  const timestamp = createdAt ? new Date(createdAt) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime())) return <span>{fallback}</span>;
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Beirut" }).format(timestamp);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Beirut" }).format(timestamp);
  return <time className="document-date-time" dateTime={createdAt} title="Date and time added · Beirut time"><span>{date}</span><small>{time}</small></time>;
}
