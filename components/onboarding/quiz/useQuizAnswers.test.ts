import { describe, expect, it } from "vitest";
import { initialState, reducer } from "./useQuizAnswers";

describe("quiz payday", () => {
  it("defaults to 1", () => {
    expect(initialState.payday).toBe(1);
    expect(initialState.paydaySkipped).toBe(false);
  });
  it("SET_PAYDAY accepts 1..28 integers", () => {
    const s = reducer(initialState, { type: "SET_PAYDAY", payday: 25 });
    expect(s.payday).toBe(25);
    expect(s.paydaySkipped).toBe(false);
  });
  it.each([0, 29, 3.5, NaN])("SET_PAYDAY rejects %s", (n) => {
    expect(reducer(initialState, { type: "SET_PAYDAY", payday: n }).payday).toBe(1);
  });
  it("SKIP_PAYDAY resets to 1 and flags skipped", () => {
    const s = reducer({ ...initialState, payday: 15 }, { type: "SKIP_PAYDAY" });
    expect(s.payday).toBe(1);
    expect(s.paydaySkipped).toBe(true);
  });
});
