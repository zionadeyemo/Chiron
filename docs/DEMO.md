# 5-minute demo script (iteration 2)

Setup: `npm run dev` with a live key in `.env.local`; open http://localhost:3000 and create a course
called "Statics". (The V0 margin-tutor script is kept in [`DEMO-V0.md`](DEMO-V0.md).)

Model wording varies; the notes say what to look for, not the exact words.

**0:00 — Paste (30 s).** Paste into the composer and press Enter:

> A simply supported beam AB of length 6 m (pin at A, roller at B) carries a point load of 12 kN
> at 2 m from A and a uniformly distributed load of 3 kN/m over its full length. Determine the
> vertical reactions at A and B.

No "is this a problem?" question. Within a few seconds the board shows the **setup** (Given,
Find, Assumptions) and Chiron says "Here's the setup. Want a hint for where to start, or the
first step?" Say: *the full solution is being planned and verified right now, and none of it is
on this page yet.*

**0:45 — Hint (30 s).** Once Hint and Next step unlock (~20 s with Gemini Pro), press **Hint**
(or `H`). A nudge appears in the margin next to step 1 ("which point can you take moments
about…"), not the step. Press it again: more specific, still no answer.

**1:15 — Next step (30 s).** Press **Next step** (`N`). Step 1 appears: ΣM_A = 0 written out,
with a small **verified** mark. Say: *every step was checked symbolically before you saw it.*

**1:45 — A question about the step (45 s).** Type "why moments about A?" The answer is short,
about that step only (moments about A eliminate R_A so one equation has one unknown) and doesn't
reveal step 2. Press **Explain more** for a deeper version.

**2:30 — I got it (20 s).** Press **I got it** (`G`). The board stops revealing; the composer
switches to *Check my work*. Say: *this is the metric that matters — how few steps someone needed.*

**2:50 — A wrong line, caught (40 s).** Type `6 R_B + 24 + 54 = 0` (sign error) and send.
The line appears on the board marked **not right**, with a pointer at the signs of the load
moments, not the corrected line.

**3:30 — The correct line (30 s).** Type `R_B = 13`. Marked **correct** and placed against the
matching step of the plan ("you’re ahead of the board" if it hasn’t been revealed). Then `R_A = 17`:
correct, and once a line matches the plan’s last step the problem is complete — by the student.

**4:00 — Resume (40 s).** Go back to the courses page, then reopen "Statics". The board, the
chat and where you were come back exactly; the course row now reads "1 solved".
Open **What CHIRON assumes** to show the concepts it inferred, each one editable.

**4:40 — The numbers (20 s).** Open `/internal/summary`: this problem's line reads steps in plan,
steps revealed before "I got it", hints, check-my-work results, and plan verification.
