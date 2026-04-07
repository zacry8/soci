import { escapeHtml } from "../shared.js";
import { getSelectOptions, parseEditValue } from "./schema.js";

function makeEditor(column, raw, context) {
  if (column.editor === "select") {
    const options = getSelectOptions(column, context)
      .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
      .join("");
    const select = document.createElement("select");
    select.className = "table-cell-editor";
    select.innerHTML = options;
    select.value = String(raw || "");
    return select;
  }

  const input = document.createElement("input");
  input.className = "table-cell-editor";
  input.type = column.editor === "date" ? "date" : "text";
  input.value = String(raw || "");
  return input;
}

export function startCellEdit({ cell, row, column, context, onCommit }) {
  if (!cell || !column?.editable) return () => {};
  const originalText = cell.textContent || "";
  const raw = context?.getRawValue?.(column, row, context) ?? originalText;
  const editor = makeEditor(column, raw, context);

  cell.classList.add("cell-editing");
  cell.innerHTML = "";
  cell.append(editor);
  editor.focus();
  if (editor.select) editor.select();

  let closed = false;
  const close = (commit) => {
    if (closed) return;
    closed = true;
    cell.classList.remove("cell-editing");
    const nextRaw = editor.value;
    cell.innerHTML = "";
    cell.textContent = originalText;
    if (!commit) return;
    const nextValue = parseEditValue(column, nextRaw, context);
    onCommit?.({ rowId: row.id, colKey: column.key, value: nextValue });
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      close(true);
    }
  };

  editor.addEventListener("keydown", onKeyDown);
  editor.addEventListener("blur", () => close(true), { once: true });

  return () => close(false);
}
