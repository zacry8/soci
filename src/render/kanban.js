import { CHECKLIST_LABELS, STATUSES, STATUS_LABELS } from "../data.js";
import { formatFriendlyDate } from "./shared.js";

const checklistKeys = Object.keys(CHECKLIST_LABELS);

function makeCard(cardTpl, post, onOpen, onDropStatus) {
  const card = cardTpl.content.firstElementChild.cloneNode(true);
  card.dataset.id = post.id;
  card.querySelector("h4").textContent = post.title;
  card.querySelector(".meta").textContent = `${post.platforms.join(", ")} • ${formatFriendlyDate(post.scheduleDate)}`;
  card.querySelector(".excerpt").textContent = post.caption.slice(0, 90) || "No caption yet.";

  const badge = card.querySelector(".card-badge");
  badge.textContent = post.publishState === "published" ? "Published" : post.publishState === "scheduled" ? "Scheduled" : "Draft";
  badge.className = `card-badge ${post.publishState}`;

  const done = checklistKeys.filter((key) => post.checklist[key]).length;
  const readyPercent = Math.round((done / checklistKeys.length) * 100);
  card.querySelector(".card-progress").innerHTML = `<span class="card-progress-mini"><span class="card-progress-mini-fill" style="width:${readyPercent}%"></span></span><span>${done}/${checklistKeys.length} ready</span>`;

  card.addEventListener("click", () => onOpen(post.id));
  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/id");
    onDropStatus(id, post.status);
  });
  card.addEventListener("dragover", (event) => event.preventDefault());
  card.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/id", post.id));
  return card;
}

export function renderKanban(root, posts, onOpen, onDropStatus) {
  const columnTpl = document.querySelector("#column-template");
  const cardTpl = document.querySelector("#card-template");
  root.innerHTML = "";

  if (posts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kanban-empty";
    empty.innerHTML = `
      <p class="kanban-empty-headline">No posts yet</p>
      <p>Click <strong>+ New Post</strong> in the sidebar to create your first post.</p>`;
    root.append(empty);
    return;
  }

  for (const status of STATUSES) {
    const col = columnTpl.content.firstElementChild.cloneNode(true);
    col.dataset.status = status;
    col.querySelector("h3").textContent = STATUS_LABELS[status];
    const list = posts.filter((post) => post.status === status);
    col.querySelector(".count").textContent = String(list.length);
    const cards = col.querySelector(".cards");

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-lane";
      empty.textContent = "No posts yet";
      cards.append(empty);
    } else {
      for (const post of list) cards.append(makeCard(cardTpl, post, onOpen, onDropStatus));
    }

    col.addEventListener("dragover", (event) => event.preventDefault());
    col.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/id");
      onDropStatus(id, status);
    });
    root.append(col);
  }
}
