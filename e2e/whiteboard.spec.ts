import { expect, test, type Page, type Response } from "@playwright/test";

// End-to-end whiteboard flow (brief 2.11) with the deterministic offline mock LLM, using the
// fixture "01-beam-determinate": the mock plans it with its reference plan, so we know exactly
// which step titles must stay hidden until revealed.

const BEAM =
  "A simply supported beam AB of length 6 m (pin at A, roller at B) carries a point load of 12 kN at 2 m from A and a uniformly distributed load of 3 kN/m over its full length. Determine the vertical reactions at A and B.";
const STEP_TITLES = ["Sum moments about A", "Solve for R_B", "Vertical equilibrium", "Reactions"];

async function newCourse(page: Page, name: string) {
  const res = await page.request.post("/api/courses", { data: { name } });
  const { course } = await res.json();
  await page.goto(`/course/${course.id}`);
  await expect(page.getByLabel("Ask anything, or paste a problem…")).toBeVisible();
  return course.id as string;
}

const composer = (page: Page) => page.locator("textarea[aria-label]").last();
const steps = (page: Page) => page.locator('article[aria-label^="Step "]');
const button = (page: Page, name: RegExp) => page.getByRole("button", { name });

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** Every API response body the page receives, tagged with how many steps were revealed when it arrived. */
function recordResponses(page: Page) {
  const seen: { url: string; body: string }[] = [];
  page.on("response", async (r: Response) => {
    if (!r.url().includes("/api/")) return;
    try {
      seen.push({ url: r.url(), body: await r.text() });
    } catch {
      /* navigations etc. */
    }
  });
  return seen;
}

test("paste a problem → setup → hint → next → question → I got it → check work", async ({ page }) => {
  const responses = recordResponses(page);
  await newCourse(page, "E2E Statics");

  // Paste a text problem: the setup appears with no question asked.
  await send(page, BEAM);
  await expect(page.getByText("Here's the setup. Want a hint for where to start, or the first step?")).toBeVisible();
  await expect(steps(page)).toHaveCount(1);
  await expect(page.getByText("Given", { exact: true })).toBeVisible();

  // Wait for the plan; Hint and Next step unlock.
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });

  // Until now, no response may contain any unrevealed step.
  for (const r of responses) for (const title of STEP_TITLES) expect(r.body, `${r.url} leaked "${title}"`).not.toContain(title);

  // Hint 1, then hint 2: in the margin, never the step itself.
  await button(page, /^Hint/).click();
  await expect(page.getByLabel("Hints for step 1")).toContainText("Which point can you take moments about");
  await button(page, /^Hint/).click();
  await expect(page.getByLabel("Hints for step 1")).toContainText("Sum moments about A. Treat the distributed load");
  await expect(steps(page)).toHaveCount(1);

  // Next step reveals exactly one step.
  await button(page, /^Next step/).click();
  await expect(steps(page)).toHaveCount(2);
  await expect(steps(page).nth(1)).toContainText("Sum moments about A");
  await expect(page.getByLabel("Hints for step 2")).toHaveCount(0);

  // Keyboard: N reveals one more.
  await page.locator("body").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("n");
  await expect(steps(page)).toHaveCount(3);

  // Still nothing beyond what's on the board.
  for (const r of responses) for (const title of STEP_TITLES.slice(2)) expect(r.body, `${r.url} leaked "${title}"`).not.toContain(title);

  // A question about step 1 answers about step 1 and doesn't advance the board.
  await send(page, "why? (step 1)");
  await expect(page.getByText(/\(mock\) Step 1, Sum moments about A/)).toBeVisible();
  await expect(steps(page)).toHaveCount(3);

  // Clicking step 2 then asking answers about step 2.
  await steps(page).nth(2).getByRole("button", { name: "2" }).click();
  await send(page, "where does this come from?");
  await expect(page.getByText(/\(mock\) Step 2, Solve for R_B/)).toBeVisible();
  await expect(steps(page)).toHaveCount(3);

  // I got it → the controls collapse to Check my work and Resume guidance.
  await button(page, /^I got it/).click();
  await expect(button(page, /^Resume guidance/)).toBeVisible();
  await expect(button(page, /^Next step/)).toHaveCount(0);

  // Check my work with a deliberate sign error: identified, not corrected outright.
  await button(page, /^Check my work/).click();
  await expect(page.getByLabel("Type your line (LaTeX is fine) or paste a photo of your work…")).toBeFocused();
  await send(page, "R_A + R_B + 12 + 18 = 0");
  await expect(page.getByLabel("Your line").last()).toContainText("not right");
  const wrongFeedback = await page.getByLabel("Your line").last().innerText();
  expect(wrongFeedback).not.toContain("17");

  // A correct line ahead of the board is marked correct and positioned in the solution.
  await button(page, /^Check my work/).click();
  await send(page, "R_A = 17");
  await expect(page.getByLabel("Your line").last()).toContainText("correct");
  await expect(page.getByText(/that's the final answer/i).last()).toBeVisible();
  await expect(steps(page)).toHaveCount(5);
  await expect(page.getByText("Solved — you got there.")).toBeVisible();
});

test("a valid alternative method re-plans from the student's work", async ({ page }) => {
  await newCourse(page, "E2E Alternative");
  await send(page, BEAM);
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Check my work/).click();
  // Moments about the point load (x = 2 m): uses both reactions, isn't a planned step.
  await send(page, "Moments about the load point: R_B*4 - R_A*2 - 18*1 = 0");
  await expect(page.getByLabel("Your line")).toHaveCount(0); // absorbed into the board as their step
  await expect(page.getByText(/I.ll continue from your method/)).toBeVisible();
  await expect(steps(page).nth(1)).toContainText("Your equation");
  await expect(steps(page).nth(1)).toContainText("your line");
});

test("Too big splits a step into verified substeps", async ({ page }) => {
  await newCourse(page, "E2E Split");
  await send(page, BEAM);
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Next step/).click();
  await expect(steps(page)).toHaveCount(2);
  await steps(page).nth(1).hover();
  await steps(page).nth(1).getByRole("button", { name: "Too big" }).click();
  await expect(steps(page).nth(1)).toContainText("Sum moments about A — set up");
  await expect(steps(page)).toHaveCount(2); // only the first substep shows; Next reveals the rest
  await button(page, /^Next step/).click();
  await expect(steps(page).nth(2)).toContainText("Sum moments about A — finish");
  await expect(page.getByText(/couldn.t verify this step/)).toHaveCount(0);
});

test("a step that fails verification is marked, and Chiron says so", async ({ page }) => {
  await newCourse(page, "E2E Unverified");
  await send(page, "E2E verification fixture: a bar of length 2 m carries a tension of 10 kN. Find the force per metre, f.");
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Next step/).click();
  await expect(steps(page).nth(1)).toContainText(/couldn.t verify this step/);
  await expect(page.getByText(/I couldn.t verify step 1 automatically/)).toBeVisible();
});

test("no material needed: a plain question gets a short answer", async ({ page }) => {
  await newCourse(page, "E2E Questions");
  await send(page, "what is a moment?");
  await expect(page.getByText("(mock) A short, direct answer to your general question.")).toBeVisible();
  await expect(composer(page)).toBeFocused();
  await expect(page.getByText("Start with a problem.")).toBeVisible();
});

test("+ New problem keeps the old one, and a pasted problem mid-problem asks first", async ({ page }) => {
  await newCourse(page, "E2E Problems");
  await send(page, BEAM);
  await expect(steps(page)).toHaveCount(1);
  // A long problem-like message in normal mode: never switches on its own.
  await send(page, "Determine the reactions of a cantilever of length 4 m with a 10 kN point load at its free end, and compute the fixed-end moment for the same beam carefully.");
  await expect(page.getByText("Start this as a new problem?")).toBeVisible();
  await button(page, /^No, it.s a question/).click();
  await expect(page.getByText("Start this as a new problem?")).toHaveCount(0);
  // + New problem.
  await page.getByRole("button", { name: "+ New problem" }).first().click();
  await send(page, "Evaluate the definite integral $\\int_0^1 x e^{x}\\,dx$ using integration by parts.");
  await expect(page.getByRole("heading", { name: /Integral of x·eˣ/ })).toBeVisible();
  // The old problem is one click away.
  await page.getByRole("button", { name: /^Problem/ }).click();
  await page.getByRole("button", { name: /Simply supported beam reactions/ }).click();
  await expect(page.getByRole("heading", { name: "Simply supported beam reactions" })).toBeVisible();
});

test("two courses each resume exactly where they were left; topics covered update", async ({ page }) => {
  const a = await newCourse(page, "E2E Course A");
  await send(page, BEAM);
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Next step/).click();
  await button(page, /^Next step/).click();
  await expect(steps(page)).toHaveCount(3);
  await steps(page).nth(1).getByRole("button", { name: "1" }).click(); // make step 1 active
  await expect(steps(page).nth(1).getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "true");

  const b = await newCourse(page, "E2E Course B");
  await send(page, "Evaluate the definite integral $\int_0^1 x e^{x}\,dx$ using integration by parts.");
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Next step/).click();
  await button(page, /^I got it/).click();
  await expect(button(page, /^Resume guidance/)).toBeVisible();

  // Leave, come back to A: same problem, same steps, same active step.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /E2E Course A/ })).toBeVisible();
  await page.goto(`/course/${a}`);
  await expect(steps(page)).toHaveCount(3);
  await expect(steps(page).nth(1).getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Simply supported beam reactions" })).toBeVisible();

  // Topics covered come from the revealed steps' concept tags.
  await page.getByRole("button", { name: "What Chiron assumes" }).click();
  await expect(page.getByLabel("What Chiron assumes")).toContainText("static equilibrium");
  await page.getByRole("button", { name: "Close" }).click();

  // B: still independent, one step revealed.
  await page.goto(`/course/${b}`);
  await expect(steps(page)).toHaveCount(2);
  await expect(button(page, /^Resume guidance/)).toBeVisible();
});

test("personalization can be turned off per course", async ({ page }) => {
  await newCourse(page, "E2E Personalize");
  await page.getByRole("button", { name: "What Chiron assumes" }).click();
  const toggle = page.getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Chiron uses only this course and the problem/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "What Chiron assumes" }).click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
});

test("the internal summary reports the problems worked on", async ({ page }) => {
  // The summary covers this visitor's own event log (DECISIONS D16). No INTERNAL_PASSWORD in dev → open.
  await newCourse(page, "E2E Summary");
  await send(page, BEAM);
  await expect(button(page, /^Next step/)).toBeEnabled({ timeout: 30_000 });
  await button(page, /^Next step/).click();
  await expect(steps(page)).toHaveCount(2);
  await button(page, /^I got it/).click();
  await expect(button(page, /^Resume guidance/)).toBeVisible();
  await page.goto("/internal/summary");
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  await expect(page.getByText(/Median steps before .I got it./)).toBeVisible();
  await expect(page.getByText(/Steps in plan: \d+ · Revealed before .I got it.: \d+/).first()).toBeVisible();
  await expect(page.getByText(/Check my work: \d+ \(\d+ correct, \d+ errors? caught/).first()).toBeVisible();
  await expect(page.getByText(/Revealed before .I got it.: 1 /)).toBeVisible();
});
