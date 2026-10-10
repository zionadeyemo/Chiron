# 5-minute demo script

Setup: `npm run dev`, key in `.env.local`, open http://localhost:3000/demo. Each visit to `/demo`
resets the demo learner (aerospace junior; knows statics, mechanics of materials, linear algebra).

Model answers vary; the notes below say what to look for, not the exact words.

**0:00 — The screen (30 s).** Left: the material, open at p. 341 (superposition), with Problem
7.18 pinned above it. Right: Chiron's margin. Bottom: the state strip. Point at **Assuming you
know** (static equilibrium, shear/moment diagrams, Euler–Bernoulli) and **Might need
refreshing** (compatibility conditions). "This is why it pitches answers where it does."

**0:30 — "Why is that zero?"** Expect one or two sentences: B is a roller, so v_B = 0, citing
p. 341, Eq. 7.6. Point out the margin line under it: depth tag (L1/L2) and the § citation.
Optional: highlight "v_B = 0" on the page, click **Ask about this**, ask "why?" instead.

**1:15 — "Wait, what are the six components of strain again?"** A one-line answer (three normal,
three shear strains), indented as an **Aside**, with a ◦ marker meaning general knowledge (it's not
in this chapter). The composer shows *Aside · back to 7.18 →*.

**1:45 — "Got it."** Chiron closes the aside and comes straight back: "Right, so for 7.18: …"
with a prompt for the next move.

**2:15 — "Okay what do I do next?"** The next step only (superpose Table 7.1 cases, set v_B = 0),
not the solution. The **Current step** in the strip updates.

**2:45 — "I think the reaction is wL/2."** (deliberately wrong) Chiron says it's wrong in its
first words and points at why (that's the symmetric, simply-supported answer; the fixed end takes
more). Look for **✓ checked**: hover it to see the math tool calls it ran.

**3:30 — Explain more** (under that note). Exactly one level deeper: the reasoning step by step,
not beam theory in general.

**4:00 — Too much** (under the longer note), then ask "So what's R_B then?" or "what next?". The
next note is visibly shorter: the state strip's **Depth** shows L1 and a word cap (≤ N w).

**4:30 — Click "compatibility conditions"** in the strip → *I know this*. That's a learner-model
correction. Open **Learner model** to show the full editable profile.

**4:45 — Summary** (top right). One sentence: questions, average words, depth feedback,
explain-more, corrections, wrong steps caught. `/research` compares Chiron against baseline.

To show the comparison arm, open `/demo?mode=baseline` and ask the same first question.

## Three riskiest assumptions, and the metric that tests each

1. **Short-by-default is what students want, and they'll tell us when the size is wrong.**
   Metric: the depth feedback mix (*just right / too much / too little*) alongside the
   *explain more* rate. Chiron wins only if *just right* is the most common rating. If *too
   little* plus *explain more* dominate, the default is too terse.
2. **A model plus a math tool won't state wrong things, including agreeing with a wrong
   student.** Metric: *errors flagged by the student* should be zero after review. Read it
   against *wrong student steps caught* and the share of calculation answers that were
   *math-verified*.
3. **Context and a learner model aim answers better, without the student re-explaining.**
   Metric: *learner-model corrections* and *task/step corrections* should be rare, and average
   words should stay well below baseline at an equal or better *just right* share. Lots of
   corrections means our assumptions about the student are wrong.
