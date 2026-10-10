import { describe, expect, it } from "vitest";
import { decideRoute, ruleIntent, stepRefFrom } from "./intent";

const on = { hasProblem: true, hasImages: false };

describe("ruleIntent — messages classified without a model call", () => {
  it.each(["next", "Next step", "next step!", "okay, next", "keep going", "what's next?", "what do I do next?"])("next step: %s", (t) => {
    expect(ruleIntent(t, on)?.intent).toBe("ask_next_step");
  });

  it.each(["hint", "a hint please", "can I get a hint?", "give me a nudge", "I'm stuck"])("hint: %s", (t) => {
    expect(ruleIntent(t, on)?.intent).toBe("ask_hint");
  });

  it.each(["I got R_B = 3wL/8", "I think the reaction is wL/2 = R_A", "R_B = 3*w*L/8", "x = 2, y = 3", "so M_A = wL^2/8"])("student work: %s", (t) => {
    expect(ruleIntent(t, on)?.intent).toBe("student_work");
  });

  it.each(["why is v_B = 0?", "where did L^3 come from?", "why do we pick R_B as the redundant", "what does compatibility mean"])("left to the model: %s", (t) => {
    expect(ruleIntent(t, on)).toBeNull();
  });

  it("does nothing without a problem, or with an image (the model decides)", () => {
    expect(ruleIntent("next", { hasProblem: false, hasImages: false })).toBeNull();
    expect(ruleIntent("hint", { hasProblem: true, hasImages: true })).toBeNull();
  });
});

describe("stepRefFrom", () => {
  it("reads step references", () => {
    expect(stepRefFrom("why? (step 2)")).toBe(2);
    expect(stepRefFrom("in step #3 where does that come from")).toBe(3);
    expect(stepRefFrom("the 4th step confuses me")).toBe(4);
    expect(stepRefFrom("why is that zero")).toBeUndefined();
  });
});

describe("decideRoute", () => {
  const ctx = (o: Partial<Parameters<typeof decideRoute>[1]> = {}) => ({ hasProblem: true, mode: "normal" as const, ...o });

  it("questions are answered and never advance the board", () => {
    expect(decideRoute("question_about_step", ctx({ stepRef: 2 }))).toEqual({ kind: "answer", stepRef: 2 });
    expect(decideRoute("general_question", ctx())).toEqual({ kind: "answer", stepRef: undefined });
    expect(decideRoute("other", ctx())).toEqual({ kind: "answer", stepRef: undefined });
  });

  it("next step and hint act like the buttons", () => {
    expect(decideRoute("ask_next_step", ctx())).toEqual({ kind: "next_step" });
    expect(decideRoute("ask_hint", ctx())).toEqual({ kind: "hint" });
  });

  it("student work goes to Check my work", () => {
    expect(decideRoute("student_work", ctx())).toEqual({ kind: "check_work" });
    expect(decideRoute("general_question", ctx({ mode: "my_work" }))).toEqual({ kind: "check_work" });
  });

  it("a new problem only switches automatically when there's no problem yet", () => {
    expect(decideRoute("new_problem", ctx({ hasProblem: false }))).toEqual({ kind: "submit_problem" });
    expect(decideRoute("new_problem", ctx())).toEqual({ kind: "chip" });
    expect(decideRoute("question_about_step", ctx({ mode: "new_problem" }))).toEqual({ kind: "submit_problem" });
  });

  it("board intents without a problem fall back to an answer", () => {
    expect(decideRoute("ask_next_step", ctx({ hasProblem: false }))).toEqual({ kind: "answer" });
    expect(decideRoute("student_work", ctx({ hasProblem: false }))).toEqual({ kind: "answer" });
  });
});
