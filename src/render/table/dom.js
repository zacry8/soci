export function cellSelector(point) {
  return `td[data-row-id="${point.rowId}"][data-col-key="${point.colKey}"]`;
}

export function getCell(table, point) {
  if (!table || !point?.rowId || !point?.colKey) return null;
  return table.querySelector(cellSelector(point));
}

export function getPointFromCell(cell) {
  if (!cell?.dataset) return null;
  return { rowId: cell.dataset.rowId || "", colKey: cell.dataset.colKey || "" };
}

export function clearCellStates(table) {
  table?.querySelectorAll("td.cell-active, td.cell-selected").forEach((cell) => {
    cell.classList.remove("cell-active", "cell-selected");
  });
}

export function applySelection(table, rows, columns, rect) {
  if (!table) return;
  clearCellStates(table);
  for (let r = rect.top; r <= rect.bottom; r += 1) {
    for (let c = rect.left; c <= rect.right; c += 1) {
      const cell = getCell(table, { rowId: rows[r]?.id, colKey: columns[c]?.key });
      if (cell) cell.classList.add("cell-selected");
    }
  }
}
