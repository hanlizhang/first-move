import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDITIONAL_NOTE_LABEL,
  DEFAULT_REFLECTION_PROMPTS,
  REFLECTION_PRIVACY_TEXT,
  shouldOpenAdditionalNote,
} from "./reflection-presentation.ts";

test("default Mini Journal UI has exactly three mapped text prompts", () => {
  assert.deepEqual(DEFAULT_REFLECTION_PROMPTS, [
    { field: "whatHelped", label: "What helped today?" },
    { field: "difficult", label: "What drained me or got in the way?" },
    { field: "nextStep", label: "What is one small thing that could support tomorrow?" },
  ]);
  const defaultFields: readonly string[] = DEFAULT_REFLECTION_PROMPTS.map(({ field }) => field);
  assert.equal(defaultFields.includes("completed"), false);
  assert.equal(defaultFields.includes("freeText"), false);
});

test("additional note disclosure opens for previously saved free text", () => {
  assert.equal(shouldOpenAdditionalNote(undefined), false);
  assert.equal(shouldOpenAdditionalNote("   "), false);
  assert.equal(shouldOpenAdditionalNote("Previously saved note"), true);
  assert.match(ADDITIONAL_NOTE_LABEL, /Body, feelings/);
});

test("journal privacy copy is device-neutral and limited to the AI boundary", () => {
  assert.equal(REFLECTION_PRIVACY_TEXT, "Saved only on this device. Not sent to AI.");
  assert.doesNotMatch(REFLECTION_PRIVACY_TEXT, /browser|medical|treat/i);
});
