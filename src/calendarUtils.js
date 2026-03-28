import { formatFriendlyDate } from "./utils.js";

export function getMonthOffsetFromDate(dateString = "") {
  if (!dateString) return 0;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const now = new Date();
  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const targetMonthIndex = target.getFullYear() * 12 + target.getMonth();
  return targetMonthIndex - nowMonthIndex;
}

export function getWeekOffsetFromDate(dateString = "") {
  if (!dateString) return 0;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  target.setHours(0, 0, 0, 0);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const startOfWeek = (date) => {
    const value = new Date(date);
    value.setDate(value.getDate() - value.getDay());
    value.setHours(0, 0, 0, 0);
    return value;
  };

  const weekStartNow = startOfWeek(now);
  const weekStartTarget = startOfWeek(target);
  const diffMs = weekStartTarget.getTime() - weekStartNow.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function getNextScheduledEvent(posts = []) {
  const scheduled = posts
    .filter((post) => post.scheduleDate)
    .map((post) => ({ ...post, _date: new Date(`${post.scheduleDate}T00:00:00`) }))
    .filter((post) => !Number.isNaN(post._date.getTime()))
    .sort((a, b) => a._date - b._date);
  if (!scheduled.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = scheduled.find((post) => post._date >= today) || scheduled[0];
  return {
    date: upcoming.scheduleDate,
    label: formatFriendlyDate(upcoming.scheduleDate)
  };
}
