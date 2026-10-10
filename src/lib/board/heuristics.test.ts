import { describe, expect, it } from "vitest";
import { looksLikeProblem } from "./intake";
import { asksAboutHistory, findMemoryPhrase } from "./memory-phrases";

describe("looksLikeProblem (decides whether to read a message as a problem first)", () => {
  it("recognises a pasted problem statement", () => {
    expect(looksLikeProblem("A simply supported beam of length 6 m carries a point load of 12 kN at 2 m from A. Determine the reactions at A and B.", false)).toBe(true);
    expect(looksLikeProblem("Evaluate the integral of x e^x from 0 to 1 using integration by parts and simplify your answer.", false)).toBe(true);
  });

  it("treats short or conversational messages as questions", () => {
    expect(looksLikeProblem("why is that zero?", false)).toBe(false);
    expect(looksLikeProblem("what does compatibility mean in this context, roughly speaking?", false)).toBe(false);
  });

  it("always reads an image first", () => {
    expect(looksLikeProblem("", true)).toBe(true);
  });
});

describe("memory-announcing phrases", () => {
  it.each([
    "As you learned in Statics, moments balance.",
    "Remember when we did superposition?",
    "Since you already know linear algebra, this is a 3×3 solve.",
    "Based on your profile, I'll skip the algebra.",
    "You've shown that you can sum moments.",
    "I remember you struggled with signs.",
  ])("flags: %s", (text) => {
    expect(findMemoryPhrase(text)).not.toBeNull();
  });

  it.each([
    "Sum moments about A; the reaction at A drops out.",
    "Remember that the roller allows rotation but not deflection.",
    "As shown in Eq. 7.6, the deflection at B is zero.",
    "Since the beam is in equilibrium, the moments sum to zero.",
  ])("leaves ordinary tutoring alone: %s", (text) => {
    expect(findMemoryPhrase(text)).toBeNull();
  });

  it("allows it when the student asks about their history", () => {
    expect(asksAboutHistory("What do you know about me?")).toBe(true);
    expect(asksAboutHistory("why is R_B zero?")).toBe(false);
  });
});
