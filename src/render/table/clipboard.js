function encodeCell(value) {
  const text = String(value ?? "");
  if (!/[\t\n\r"]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toTsvMatrix(rows, columns, rect, getValue) {
  const lines = [];
  for (let r = rect.top; r <= rect.bottom; r += 1) {
    const row = rows[r];
    const values = [];
    for (let c = rect.left; c <= rect.right; c += 1) {
      const column = columns[c];
      values.push(encodeCell(getValue(row, column)));
    }
    lines.push(values.join("\t"));
  }
  return lines.join("\n");
}

export function parseTsv(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const matrix = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  matrix.push(row);

  while (matrix.length && matrix[matrix.length - 1].every((value) => !String(value || "").trim())) {
    matrix.pop();
  }

  return matrix.filter((cells) => cells.some((value) => String(value || "").trim()));
}
