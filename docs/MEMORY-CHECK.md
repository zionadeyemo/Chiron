# Memory check (Phase 3)

Run 2026-10-09 14:52 against the live model. Regenerate with `npx tsx --conditions=react-server scripts/check-memory.ts`.

1. **No memory-announcing phrases in a full guided problem: PASS.** Problem 7.18 with personalization on, 5 steps revealed, 7 Chiron replies (questions at every step, one Explain more). Phrases found: none. The chat post-check regenerates once if a reply does announce memory, so this measures what students actually see.
2. **Personalization off removes learner context from requests: PASS.** Requests carrying `<learner>` — on: intake 0/1, plan 1/1, chat 6/6; off: intake 0/1, plan 0/1, chat 0/4. (Intake and work-reading calls never carry it.) The `plan_ready`, `step_question` and `explain_more` events record `personalized` for the same check in the event log.

## Replies (personalized run)

1. Here's the setup. Want a hint for where to start, or the first step?
2. Releasing the roller support leaves a determinate cantilever beam (the primary structure). We find the separate deflections at $B$ from the distributed load $w$ and the redundant force $R_B$ so we can enforce the compatibility condition that total deflection at the roller is zero.
3. The roller support prevents vertical movement, so the net deflection at $B$ must be zero: $$\Delta_B = (\Delta_B)_{R_B} - (\Delta_B)_w = 0$$ Setting the upward deflection caused by $R_B$ equal to the downward deflection caused by $w$ and canceling $L^3/(EI)$ isolates $R_B = \frac{3wL}{8}$.
4. Because a rigid roller cannot move vertically, the physical boundary condition is $y(B) = 0$.  By linear superposition, total deflection is the sum of the downward deflection from $w$ and the upward deflection from $R_B$: $$-\frac{wL^4}{8EI} + \frac{R_B L^3}{3EI} = 0$$ Equating the two terms and solving for $R_B$: $$\frac{R_B L^3}{3EI} = \frac{wL^4}{8EI}$$ Multiplying both sides by $\frac{3EI}{L^3}$ clears the stiffness and length factors, leaving: $$R_B = \frac{3}{8}wL$$
5. With $R_B$ known, the remaining reactions come directly from static equilibrium.  Vertical force balance gives $R_A + R_B = wL$, and moment equilibrium about $A$ balances the distributed load's moment, $\frac{wL^2}{2}$, against $R_B L$ to find the wall moment $M_A$.
6. Part (c) asks for the location where the bending moment is zero (the point of contraflexure). We need the equation $M(x)$ across the beam so we can set $M(x) = 0$ and solve for $x$.
7. This completes part (c) by solving $M(x) = 0$ for the position between $A$ and $B$.  The quadratic gives two roots: $x = L$ (the roller end, where moment naturally vanishes) and $x = L/4$, which is the interior point of contraflexure requested.

## Replies (personalization off)

1. Here's the setup. Want a hint for where to start, or the first step?
2. The beam is statically indeterminate, so equilibrium equations alone cannot find all reactions. Because $B$ is a roller support, the net vertical deflection there must be zero. Superimposing the deflections from the uniform load and the redundant force $R_B$ gives the compatibility equation needed to solve for $R_B$.
3. Solve the compatibility equation from Step 1 for $R_B$: $$\frac{R_B L^3}{3EI} = \frac{wL^4}{8EI}$$ Multiplying both sides by $\frac{3EI}{L^3}$ yields $R_B = \frac{3wL}{8}$. (The deflection terms in Step 1 are standard formulas for a cantilever loaded at the free end and under uniform load.)
4. To derive those cantilever deflection terms directly, integrate $EI \, v''(x) = M(x)$ subject to fixed-end conditions $v(0) = 0$ and $v'(0) = 0$: - **Tip load $R_B$ upward:** $M(x) = R_B(L-x)$. Integrating twice yields $EI \, v(x) = R_B\left(\frac{Lx^2}{2} - \frac{x^3}{6}\right)$, so the upward tip displacement is $v(L) = \frac{R_B L^3}{3EI}$. - **Uniform load $w$ downward:** $M(x) = -\frac{w(L-x)^2}{2}$. Integrating twice yields downward displacement $|v(L)| = \frac{wL^4}{8EI}$. Equating these two displacements forces the net deflection at roller $B$ to zero, isolating $R_B = \frac{3wL}{8}$.
5. The total downward force from the distributed load is $wL$. For vertical equilibrium ($\sum F_y = 0$), the upward support reactions must balance it: $$R_A + R_B = wL$$ Substituting $R_B = \frac{3}{8}wL$ yields $R_A = wL - \frac{3}{8}wL = \frac{5}{8}wL$.
