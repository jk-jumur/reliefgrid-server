import type { Document } from "mongodb";

const csvCell = (value: unknown): string => {
  const isText = typeof value === "string";
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (isText && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export const toCsv = (items: Document[]): string => {
  if (items.length === 0) return "";
  const columns = [...new Set(items.flatMap((item) => Object.keys(item)))];
  return [
    columns.map(csvCell).join(","),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(",")),
  ].join("\r\n");
};
