function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(client, posts) {
  const header = ["title", "date", "platforms", "status", "publish_state", "caption"];
  const rows = posts.map((p) => [p.title, p.scheduleDate, p.platforms.join("|"), p.status, p.publishState, p.caption].map((v) => `"${String(v || "").replaceAll('"', '""')}"`).join(","));
  downloadFile(`${client.shareSlug}-calendar.csv`, [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

export function exportIcs(client, posts) {
  const events = posts.map((post) => {
    const stamp = `${post.scheduleDate.replaceAll("-", "")}T090000`;
    const uid = `${post.id}@soci.local`;
    const summary = (post.title || "Untitled").replace(/[,;\\]/g, "");
    const desc = (post.caption || "").replace(/\n/g, "\\n").replace(/[,;\\]/g, "");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${stamp}`,
      `DTEND:${stamp}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      "END:VEVENT"
    ].join("\n");
  });
  const file = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soci//Calendar//EN", ...events, "END:VCALENDAR"].join("\n");
  downloadFile(`${client.shareSlug}-calendar.ics`, file, "text/calendar;charset=utf-8");
}
