import { escapeHtml } from "./shared.js";
import { STATUS_LABELS } from "../data.js";

export function renderCalendar(root, posts, onOpen, offset = 0, onOffsetChange, options = {}) {
  const viewMode = options?.viewMode === "week" ? "week" : "month";
  const weekOffset = Number.isInteger(options?.weekOffset) ? options.weekOffset : 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const target = new Date(year, month, 1);
  const displayYear = target.getFullYear();
  const displayMonth = target.getMonth();

  const startOfWeek = (date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    value.setDate(value.getDate() - value.getDay());
    return value;
  };
  const toIsoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const monthLabel = target.toLocaleString("default", { month: "long", year: "numeric" });
  const weekStart = startOfWeek(now);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
  const label = viewMode === "week" ? weekLabel : monthLabel;

  const postsInDisplayedRange = posts.filter((post) => {
    if (!post.scheduleDate) return false;
    const d = new Date(`${post.scheduleDate}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    if (viewMode === "week") {
      return d >= weekStart && d <= weekEnd;
    }
    return d.getFullYear() === displayYear && d.getMonth() === displayMonth;
  }).length;
  const nextEventButton = options?.nextEvent && postsInDisplayedRange === 0
    ? `<button id="cal-next-event" class="calendar-next-event icon-only" type="button" title="Jump to Next Scheduled" aria-label="Jump to Next Scheduled"><i data-lucide="calendar-days" aria-hidden="true"></i></button>`
    : "";

  root.innerHTML = `
    <div class="calendar-nav">
      <div class="calendar-nav-primary">
        <div class="calendar-nav-segment">
          <button id="cal-prev" class="calendar-arrow" title="${viewMode === "week" ? "Previous Week" : "Previous Month"}" aria-label="${viewMode === "week" ? "Previous Week" : "Previous Month"}">&#8249;</button>
          <h4 class="calendar-nav-label">${label}</h4>
          <button id="cal-next" class="calendar-arrow" title="${viewMode === "week" ? "Next Week" : "Next Month"}" aria-label="${viewMode === "week" ? "Next Week" : "Next Month"}">&#8250;</button>
        </div>
      </div>
      <div class="calendar-nav-secondary">
        <div class="calendar-view-mode" role="group" aria-label="Calendar view mode">
          <button id="cal-mode-month" class="calendar-view-btn ${viewMode === "month" ? "active" : ""}" type="button">Month</button>
          <button id="cal-mode-week" class="calendar-view-btn ${viewMode === "week" ? "active" : ""}" type="button">Week</button>
        </div>
        ${nextEventButton}
      </div>
    </div>
    <div class="calendar-grid"></div>
  `;

  root.querySelector("#cal-prev").addEventListener("click", () => {
    if (viewMode === "week") {
      options?.onWeekOffsetChange?.(-1);
      return;
    }
    onOffsetChange?.(-1);
  });
  root.querySelector("#cal-next").addEventListener("click", () => {
    if (viewMode === "week") {
      options?.onWeekOffsetChange?.(1);
      return;
    }
    onOffsetChange?.(1);
  });
  root.querySelector("#cal-mode-month")?.addEventListener("click", () => options?.onViewModeChange?.("month"));
  root.querySelector("#cal-mode-week")?.addEventListener("click", () => options?.onViewModeChange?.("week"));
  root.querySelector("#cal-next-event")?.addEventListener("click", () => {
    options?.onJumpToDate?.(options.nextEvent?.date || "");
  });

  const grid = root.querySelector(".calendar-grid");

  const renderDayChips = (box, date) => {
    for (const post of posts.filter((p) => p.scheduleDate === date)) {
      const chip = document.createElement("div");
      chip.className = "chip";
      const platformAbbr = post.platforms[0]?.slice(0, 2).toUpperCase() || "–";
      chip.innerHTML = `<div>${escapeHtml(post.title.slice(0, 20) || "Untitled")}</div><div class="chip-meta">${platformAbbr} · ${STATUS_LABELS[post.status] || post.status}</div>`;
      chip.addEventListener("click", () => onOpen(post.id));
      box.append(chip);
    }
  };

  if (viewMode === "week") {
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const box = document.createElement("div");
      box.className = "day";
      box.innerHTML = `<div class="day-weekday">${day.toLocaleDateString(undefined, { weekday: "short" })}</div><div class="day-number">${day.getDate()}</div>`;
      renderDayChips(box, toIsoDate(day));
      grid.append(box);
    }
    return;
  }

  const first = new Date(displayYear, displayMonth, 1).getDay();
  const days = new Date(displayYear, displayMonth + 1, 0).getDate();
  const total = 35;

  for (let i = 1; i <= total; i += 1) {
    const box = document.createElement("div");
    box.className = "day";
    const dayNum = i - first;
    box.innerHTML = `<div class="day-number">${dayNum > 0 && dayNum <= days ? dayNum : ""}</div>`;
    if (dayNum > 0 && dayNum <= days) {
      const date = `${displayYear}-${String(displayMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      renderDayChips(box, date);
    }
    grid.append(box);
  }
}
