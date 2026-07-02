import { describe, expect, it } from "vitest";
import { saveTemplateDurableId } from "./saveTemplateDurableId";

describe("saveTemplateDurableId", () => {
  it("prefers an existing templateItemId over everything else", () => {
    const id = saveTemplateDurableId({
      templateItemId: "tmpl-existing",
      sourceItemId: "row-123",
      id: "form-abc",
    });
    expect(id).toBe("tmpl-existing");
  });

  it("falls back to a real (non-temp_) sourceItemId when no templateItemId", () => {
    const id = saveTemplateDurableId({
      templateItemId: null,
      sourceItemId: "row-123",
      id: "form-abc",
    });
    expect(id).toBe("row-123");
  });

  it("skips a temp_-prefixed sourceItemId (offline-built row) and falls back to id", () => {
    const id = saveTemplateDurableId({
      templateItemId: null,
      sourceItemId: "temp_9f1c2b3a-uuid",
      id: "form-abc",
    });
    expect(id).toBe("form-abc");
  });

  it("falls back to id when neither templateItemId nor sourceItemId is set", () => {
    const id = saveTemplateDurableId({ id: "form-abc" });
    expect(id).toBe("form-abc");
  });
});
