import assert from "node:assert/strict";
import test from "node:test";

import { cloudSetupEnabled } from "./cloud-setup-feature.ts";

test("cloud setup is disabled unless explicitly true", () => {
  assert.equal(cloudSetupEnabled(undefined), false);
  assert.equal(cloudSetupEnabled(""), false);
  assert.equal(cloudSetupEnabled("false"), false);
  assert.equal(cloudSetupEnabled("TRUE"), false);
  assert.equal(cloudSetupEnabled("true"), true);
});
