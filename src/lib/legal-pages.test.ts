import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = (name: string) =>
  readFileSync(new URL(`../app/${name}/page.tsx`, import.meta.url), "utf8");
const legalPage = readFileSync(
  new URL("../app/legal-page.tsx", import.meta.url),
  "utf8",
);

test("public legal and support routes use the approved documents without auth", () => {
  assert.match(route("privacy"), /document="privacy-policy\.md"/);
  assert.match(route("terms"), /document="terms-of-use\.md"/);
  assert.match(route("support"), /document="support\.md"/);
  assert.doesNotMatch(legalPage, /createClient|auth|sign.?in/i);
});

test("the internal App Store checklist has no public route or link", () => {
  for (const source of [legalPage, route("privacy"), route("terms"), route("support")]) {
    assert.doesNotMatch(source, /app-store-privacy-checklist/);
  }
});

test("legal rendering activates ordinary HTTPS and email links", () => {
  assert.match(legalPage, /href=\{token\}/);
  assert.match(legalPage, /href=\{`mailto:\$\{token\}`\}/);
});
