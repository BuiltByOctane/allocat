import { describe, expect, it } from "vitest";
import { initialState, reducer } from "./useQuizAnswers";

describe("quiz payday", () => {
  it("starts unchosen (no default day)", () => {
    expect(initialState.payday).toBeNull();
    expect(initialState.paydaySkipped).toBe(false);
  });
  it("SET_PAYDAY accepts 1..28 integers", () => {
    const s = reducer(initialState, { type: "SET_PAYDAY", payday: 25 });
    expect(s.payday).toBe(25);
    expect(s.paydaySkipped).toBe(false);
  });
  it.each([0, 29, 3.5, NaN])("SET_PAYDAY ignores %s (never an explicit 1)", (n) => {
    expect(reducer(initialState, { type: "SET_PAYDAY", payday: n }).payday).toBeNull();
    expect(reducer({ ...initialState, payday: 15 }, { type: "SET_PAYDAY", payday: n }).payday).toBe(15);
  });
  it("SET_PAYDAY 1 is an explicit choice", () => {
    const s = reducer(initialState, { type: "SET_PAYDAY", payday: 1 });
    expect(s.payday).toBe(1);
    expect(s.paydaySkipped).toBe(false);
  });
  it("SKIP_PAYDAY leaves the day unchosen and flags skipped", () => {
    const s = reducer({ ...initialState, payday: 15 }, { type: "SKIP_PAYDAY" });
    expect(s.payday).toBeNull();
    expect(s.paydaySkipped).toBe(true);
  });
});
