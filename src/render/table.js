import { escapeHtml } from "./shared.js";
import { parseTsv, toTsvMatrix } from "./table/clipboard.js";
import { applySelection, getCell, getPointFromCell } from "./table/dom.js";
import { startCellEdit } from "./table/editing.js";
import { indexMap, makeGridState, movePoint, pointFromRect, rectFromPoints, rectFromSelection } from "./table/gridState.js";
import { sortMarker, toTableRows } from "./table/metrics.js";
import { TABLE_COLUMNS, formatCellValue, getColumn, getRawCellValue, parseEditValue } from "./table/schema.js";

const NEW_ROW_ID = "__new_row__";

function makeInputRow(clients, activeClientId) {
  return {
    id: NEW_ROW_ID,
    isInputRow: true,
    post: {
      id: NEW_ROW_ID,
      title: "",
      clientId: activeClientId || clients[0]?.id || "",
      status: "idea",
      platforms: [],
      assignee: "",
      scheduleDate: ""
    },
    readiness: 0,
    mediaCount: 0,
    blockedText: ""
  };
}

function headerHtml(sort) {
  return TABLE_COLUMNS.map((column) => {
    if (!column.sortable) return `<th>${escapeHtml(column.label)}</th>`;
    return `<th><button type="button" data-sort="${column.key}">${escapeHtml(column.label)} ${sortMarker(sort, column.key)}</button></th>`;
  }).join("");
}

function rowHtml(row, context) {
  return `<tr class="${row.isInputRow ? "row-input" : "row-open"}" data-row-id="${row.id}">${TABLE_COLUMNS.map((column) => {
    const display = row.isInputRow
      ? (column.key === "title" ? "Paste rows here…" : (column.editable ? "" : "—"))
      : formatCellValue(column, row, context);
    const readiness = Number(row.readiness || 0);
    const readinessTone = readiness >= 80 ? "green" : readiness >= 50 ? "yellow" : "red";
    const readinessHtml = `<div class="readiness-cell"><span class="readiness-traffic ${readinessTone}"></span><span class="readiness-percent">${readiness}%</span><span class="readiness-bar"><span class="readiness-bar-fill ${readinessTone}" style="width:${Math.max(0, Math.min(100, readiness))}%"></span></span></div>`;
    const classes = ["table-cell", column.editable ? "" : "cell-readonly", row.isInputRow ? "cell-input-row" : "", column.key === "readiness" ? "cell-readiness" : ""].filter(Boolean).join(" ");
    const content = column.key === "readiness" && !row.isInputRow ? readinessHtml : escapeHtml(display);
    return `<td class="${classes}" data-row-id="${row.id}" data-col-key="${column.key}" tabindex="-1">${content}</td>`;
  }).join("")}</tr>`;
}

export function renderTable(root, posts, options = {}) {
  if (!root) return;
  const onOpen = typeof options.onOpen === "function" ? options.onOpen : () => {};
  const onSortChange = typeof options.onSortChange === "function" ? options.onSortChange : () => {};
  const onCellUpdate = typeof options.onCellUpdate === "function" ? options.onCellUpdate : () => {};
  const onBatchCellUpdate = typeof options.onBatchCellUpdate === "function" ? options.onBatchCellUpdate : null;
  const onBatchCreateRows = typeof options.onBatchCreateRows === "function" ? options.onBatchCreateRows : null;
  const sort = options.sort || { key: "scheduleDate", direction: "asc" };
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const context = { clients, clientsById: new Map(clients.map((client) => [client.id, client])) };

  if (root.__tableAbort) root.__tableAbort.abort();
  root.__tableAbort = new AbortController();
  const { signal } = root.__tableAbort;

  if (!posts.length) {
    const emptyRows = [makeInputRow(clients, options.activeClientId || "")];
    root.innerHTML = `<div class="table-wrap"><table class="posts-table" tabindex="0" role="grid"><thead><tr>${headerHtml(sort)}</tr></thead><tbody>${emptyRows.map((row) => rowHtml(row, context)).join("")}</tbody></table></div><div class="table-empty">No posts match current filters. Use the blank row above to paste new entries.</div>`;
  }

  const rows = [...toTableRows(posts, sort), makeInputRow(clients, options.activeClientId || "")];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  root.innerHTML = `<div class="table-wrap"><table class="posts-table" tabindex="0" role="grid"><thead><tr>${headerHtml(sort)}</tr></thead><tbody>${rows.map((row) => rowHtml(row, context)).join("")}</tbody></table></div>`;
  const table = root.querySelector(".posts-table");
  if (!table) return;

  const index = indexMap(rows, TABLE_COLUMNS);
  const state = makeGridState(rows, TABLE_COLUMNS);
  let cancelEditing = null;
  let pasteFlashTimer = null;

  const pointAt = (rowIndex, colIndex) => {
    const safeRow = Math.max(0, Math.min(rows.length - 1, rowIndex));
    const safeCol = Math.max(0, Math.min(TABLE_COLUMNS.length - 1, colIndex));
    return { rowId: rows[safeRow]?.id, colKey: TABLE_COLUMNS[safeCol]?.key };
  };

  const setSelectionToRect = (rect) => {
    state.anchor = pointAt(rect.top, rect.left);
    state.active = pointAt(rect.bottom, rect.right);
    state.selection = pointFromRect(rect, rows, TABLE_COLUMNS);
    draw();
  };

  const flashPasteRect = (rect) => {
    table.querySelectorAll("td.cell-paste-flash").forEach((cell) => cell.classList.remove("cell-paste-flash"));
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      for (let c = rect.left; c <= rect.right; c += 1) {
        const cell = getCell(table, pointAt(r, c));
        if (cell) cell.classList.add("cell-paste-flash");
      }
    }
    if (pasteFlashTimer) clearTimeout(pasteFlashTimer);
    pasteFlashTimer = setTimeout(() => {
      table.querySelectorAll("td.cell-paste-flash").forEach((cell) => cell.classList.remove("cell-paste-flash"));
    }, 550);
  };

  const draw = () => {
    const rect = rectFromSelection(state.selection, index);
    applySelection(table, rows, TABLE_COLUMNS, rect);
    table.querySelectorAll("td.cell-active").forEach((cell) => cell.classList.remove("cell-active"));
    const activeCell = getCell(table, state.active);
    if (activeCell) {
      activeCell.classList.add("cell-active");
      table.querySelectorAll("td[tabindex='0']").forEach((cell) => cell.setAttribute("tabindex", "-1"));
      activeCell.setAttribute("tabindex", "0");
    }
  };

  signal.addEventListener("abort", () => {
    if (pasteFlashTimer) clearTimeout(pasteFlashTimer);
  }, { once: true });

  const setSelectionTo = (point, { extend = false } = {}) => {
    if (!extend) state.anchor = point;
    state.active = point;
    const rect = rectFromPoints(state.anchor, point, index);
    state.selection = pointFromRect(rect, rows, TABLE_COLUMNS);
    draw();
  };

  const commitCell = ({ rowId, colKey, value }) => {
    onCellUpdate(rowId, { [colKey]: value });
  };

  const startEdit = (point) => {
    const row = rowById.get(point.rowId);
    const column = getColumn(point.colKey);
    if (!row || row.isInputRow || !column?.editable) return;
    cancelEditing?.();
    const cell = getCell(table, point);
    cancelEditing = startCellEdit({
      cell,
      row,
      column,
      context: { ...context, row, getRawValue: getRawCellValue },
      onCommit: commitCell
    });
  };

  table.addEventListener("mousedown", (event) => {
    const cell = event.target.closest("td[data-row-id][data-col-key]");
    if (!cell) return;
    const point = getPointFromCell(cell);
    if (!point?.rowId || !point?.colKey) return;
    state.dragging = true;
    setSelectionTo(point, { extend: event.shiftKey });
    table.focus();
    event.preventDefault();
  }, { signal });

  table.addEventListener("mouseover", (event) => {
    if (!state.dragging) return;
    const cell = event.target.closest("td[data-row-id][data-col-key]");
    const point = getPointFromCell(cell);
    if (!point?.rowId || !point?.colKey) return;
    setSelectionTo(point, { extend: true });
  }, { signal });

  window.addEventListener("mouseup", () => { state.dragging = false; }, { signal });
  table.addEventListener("dblclick", (event) => {
    const cell = event.target.closest("td[data-row-id][data-col-key]");
    const point = getPointFromCell(cell);
    if (!point?.rowId || !point?.colKey) return;
    setSelectionTo(point);
    if (event.altKey && point.rowId !== NEW_ROW_ID) onOpen(point.rowId);
    else startEdit(point);
  }, { signal });

  table.addEventListener("click", (event) => {
    const cell = event.target.closest("td[data-row-id][data-col-key]");
    const point = getPointFromCell(cell);
    if (!point?.rowId || !point?.colKey) return;
    setSelectionTo(point, { extend: event.shiftKey });
  }, { signal });

  table.addEventListener("keydown", (event) => {
    if (event.target.closest(".table-cell-editor")) return;
    if (event.key === "Enter") { event.preventDefault(); startEdit(state.active); return; }
    if (event.key === "Tab") { event.preventDefault(); setSelectionTo(movePoint(state.active, 0, event.shiftKey ? -1 : 1, rows, TABLE_COLUMNS, index), { extend: false }); return; }
    const vectors = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (!vectors[event.key]) return;
    event.preventDefault();
    const [dr, dc] = vectors[event.key];
    setSelectionTo(movePoint(state.active, dr, dc, rows, TABLE_COLUMNS, index), { extend: event.shiftKey });
  }, { signal });

  table.addEventListener("copy", (event) => {
    if (event.target.closest(".table-cell-editor")) return;
    const rect = rectFromSelection(state.selection, index);
    const text = toTsvMatrix(rows, TABLE_COLUMNS, rect, (row, col) => getRawCellValue(col, row, context));
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
  }, { signal });

  table.addEventListener("paste", (event) => {
    if (event.target.closest(".table-cell-editor")) return;
    const matrix = parseTsv(event.clipboardData?.getData("text/plain") || "");
    if (!matrix.length) return;
    event.preventDefault();
    const start = { row: index.rowIndexById.get(state.active.rowId) ?? 0, col: index.colIndexByKey.get(state.active.colKey) ?? 0 };
    if (state.active.rowId === NEW_ROW_ID) {
      const rowsToCreate = matrix.map((cells, rowIndex) => {
        const base = { rowNumber: rowIndex + 1, clientId: options.activeClientId || clients[0]?.id || "", status: "idea" };
        cells.forEach((raw, colIndex) => {
          const column = TABLE_COLUMNS[start.col + colIndex];
          if (!column?.editable) return;
          const value = parseEditValue(column, raw, { ...context, row: rowById.get(NEW_ROW_ID) });
          if (value === "" || value == null || (Array.isArray(value) && !value.length)) return;
          base[column.key] = value;
        });
        return base;
      }).filter((row) => Object.keys(row).some((key) => !["rowNumber", "clientId", "status"].includes(key)));
      if (rowsToCreate.length) onBatchCreateRows?.(rowsToCreate);
      return;
    }

    const selectionRect = rectFromSelection(state.selection, index);
    const isSingleValuePaste = matrix.length === 1 && (matrix[0]?.length || 0) === 1;

    const patches = new Map();
    let appliedRect = null;

    if (isSingleValuePaste && (selectionRect.bottom > selectionRect.top || selectionRect.right > selectionRect.left)) {
      const raw = matrix[0][0] || "";
      for (let r = selectionRect.top; r <= selectionRect.bottom; r += 1) {
        for (let c = selectionRect.left; c <= selectionRect.right; c += 1) {
          const row = rows[r];
          const column = TABLE_COLUMNS[c];
          if (!row || row.isInputRow || !column?.editable) continue;
          const value = parseEditValue(column, raw, { ...context, row });
          const patch = patches.get(row.id) || {};
          patch[column.key] = value;
          patches.set(row.id, patch);
        }
      }
      appliedRect = selectionRect;
    } else {
      matrix.forEach((cells, r) => cells.forEach((raw, c) => {
        const row = rows[start.row + r];
        const column = TABLE_COLUMNS[start.col + c];
        if (!row || row.isInputRow || !column?.editable) return;
        const value = parseEditValue(column, raw, { ...context, row });
        const patch = patches.get(row.id) || {};
        patch[column.key] = value;
        patches.set(row.id, patch);
      }));

      const endRow = Math.min(rows.length - 1, start.row + matrix.length - 1);
      const widestRow = Math.max(...matrix.map((cells) => cells.length));
      const endCol = Math.min(TABLE_COLUMNS.length - 1, start.col + Math.max(0, widestRow - 1));
      appliedRect = {
        top: start.row,
        left: start.col,
        bottom: endRow,
        right: endCol
      };
    }

    const updates = [...patches.entries()].map(([rowId, patch]) => ({ rowId, patch }));
    if (!updates.length) return;
    if (onBatchCellUpdate) onBatchCellUpdate(updates);
    else updates.forEach((update) => onCellUpdate(update.rowId, update.patch));

    if (appliedRect) {
      setSelectionToRect(appliedRect);
      flashPasteRect(appliedRect);
    }
  }, { signal });

  root.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-sort") || "scheduleDate";
      const nextDirection = sort.key === key && sort.direction === "asc" ? "desc" : "asc";
      onSortChange({ key, direction: nextDirection });
    }, { signal });
  });

  draw();
}
