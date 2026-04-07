export function makeGridState(rows, columns) {
  const firstRowId = rows[0]?.id || "";
  const firstColKey = columns[0]?.key || "";
  return {
    active: { rowId: firstRowId, colKey: firstColKey },
    anchor: { rowId: firstRowId, colKey: firstColKey },
    selection: { topRowId: firstRowId, bottomRowId: firstRowId, leftColKey: firstColKey, rightColKey: firstColKey },
    dragging: false,
    editing: null
  };
}

export function indexMap(rows, columns) {
  return {
    rowIndexById: new Map(rows.map((row, i) => [row.id, i])),
    colIndexByKey: new Map(columns.map((col, i) => [col.key, i]))
  };
}

export function rectFromPoints(a, b, index) {
  const ai = index.rowIndexById.get(a.rowId) ?? 0;
  const bi = index.rowIndexById.get(b.rowId) ?? ai;
  const aj = index.colIndexByKey.get(a.colKey) ?? 0;
  const bj = index.colIndexByKey.get(b.colKey) ?? aj;
  const top = Math.min(ai, bi);
  const bottom = Math.max(ai, bi);
  const left = Math.min(aj, bj);
  const right = Math.max(aj, bj);
  return { top, bottom, left, right };
}

export function pointFromRect(rect, rows, columns) {
  return {
    topRowId: rows[rect.top]?.id,
    bottomRowId: rows[rect.bottom]?.id,
    leftColKey: columns[rect.left]?.key,
    rightColKey: columns[rect.right]?.key
  };
}

export function rectFromSelection(selection, index) {
  return {
    top: index.rowIndexById.get(selection.topRowId) ?? 0,
    bottom: index.rowIndexById.get(selection.bottomRowId) ?? 0,
    left: index.colIndexByKey.get(selection.leftColKey) ?? 0,
    right: index.colIndexByKey.get(selection.rightColKey) ?? 0
  };
}

export function movePoint(point, deltaRow, deltaCol, rows, columns, index) {
  const r = index.rowIndexById.get(point.rowId) ?? 0;
  const c = index.colIndexByKey.get(point.colKey) ?? 0;
  const nextR = Math.max(0, Math.min(rows.length - 1, r + deltaRow));
  const nextC = Math.max(0, Math.min(columns.length - 1, c + deltaCol));
  return { rowId: rows[nextR]?.id || point.rowId, colKey: columns[nextC]?.key || point.colKey };
}
