export function toTsvMatrix(rows, columns, rect, getValue) {
  const lines = [];
  for (let r = rect.top; r <= rect.bottom; r += 1) {
    const row = rows[r];
    const values = [];
    for (let c = rect.left; c <= rect.right; c += 1) {
      const column = columns[c];
      const value = String(getValue(row, column) ?? "").replace(/\t/g, " ").replace(/\n/g, " ");
      values.push(value);
    }
    lines.push(values.join("\t"));
  }
  return lines.join("\n");
}

export function parseTsv(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cells) => cells.some((cell) => String(cell || "").trim()));
}
