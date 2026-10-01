/**
 * CSV for a spreadsheet (Brief §26). Two things beyond quoting:
 *
 * - A cell that starts with `=`, `+`, `-`, `@`, tab or carriage return would
 *   be run as a formula by Excel or Sheets. Creator names, brands and song
 *   titles come from outside, so every such cell gets a leading apostrophe
 *   (OWASP's CSV-injection guidance) and shows as plain text.
 * - A byte-order mark in front, so Excel reads the file as UTF-8 and
 *   umlauts survive.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
