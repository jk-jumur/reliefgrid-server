import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "./export.csv.js";

test("CSV output neutralizes spreadsheet formulas in text fields", () => {
  const csv = toCsv([{ name: "=HYPERLINK(\"https://example.test\")", quantity: -4 }]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /,"-4"$/);
});
