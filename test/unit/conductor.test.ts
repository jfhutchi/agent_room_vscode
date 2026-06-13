import assert from "node:assert/strict";
import test from "node:test";
import { typingIndicatorFor } from "../../src/core/Conductor";

test("typing indicators follow the SPEC §12 phrasing per role", () => {
  assert.equal(typingIndicatorFor("Atlas", ["planner", "architect"]), "Atlas is planning…");
  assert.equal(typingIndicatorFor("Forge", ["coder", "documentationWriter"]), "Forge is coding…");
  assert.equal(typingIndicatorFor("Sentinel", ["reviewer", "securityAuditor"]), "Sentinel is reviewing…");
  assert.equal(typingIndicatorFor("Gauge", ["tester", "devOpsReviewer"]), "Gauge is checking tests…");
  assert.equal(typingIndicatorFor("Scout", ["webResearcher"]), "Scout is researching…");
  assert.equal(typingIndicatorFor("Conductor", ["moderator", "transcriptSummarizer"]), "Conductor is summarizing…");
  assert.equal(typingIndicatorFor("Custom", []), "Custom is working…");
});
