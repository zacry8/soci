import { escapeHtml } from "./shared.js";
import { renderCalendar } from "./calendar.js";

export function renderShareCalendar(root, client, posts, offset = 0, onOffsetChange) {
  root.innerHTML = `
    <div class="share-view-head">
      <h3>${escapeHtml(client.name)} — Shared Calendar</h3>
      <p class="subtle">Client-safe calendar view (internal posts hidden)</p>
    </div>
    <div id="share-calendar-grid"></div>
  `;
  const calendarRoot = root.querySelector("#share-calendar-grid");
  renderCalendar(calendarRoot, posts, () => {}, offset, onOffsetChange);
}
