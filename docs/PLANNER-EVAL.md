# Planner eval

Run 2026-10-09 14:49 · provider gemini · planner `gemini-pro-latest` · personalization off.
Regenerate with `npx tsx --conditions=react-server scripts/eval-planner.ts`. Fixtures: `fixtures/problems/`.

**Final answers correct: 6 / 6.** Fully verified: 6 / 6.

| Fixture | Answer | Verification | Steps | Repair rounds | Plan time | Hint leaks (auto) | Check questions | Scaffolds |
|---|---|---|---|---|---|---|---|---|
| 01-beam-determinate | ✓ | verified | 4 | 0 | 20.5 s | none | 1 | 0 |
| 02-propped-cantilever | ✓ | verified | 6 | 0 | 54.6 s | none | 0 | 0 |
| 03-linear-system | ✓ | verified | 6 | 1 | 38.1 s | ⚠ 1 | 0 | 1 |
| 04-definite-integral | ✓ | verified | 4 | 0 | 16.2 s | none | 0 | 0 |
| 05-first-order-ode | ✓ | verified | 5 | 0 | 18.1 s | none | 1 | 0 |
| 06-conceptual-deflection | ✓ | verified | 3 | 0 | 15.2 s | none | 0 | 0 |

Hint leaks (auto) is a code spot-check: a hint must not contain its step's result expression or a distinctive numeric value. The manual spot-check is recorded below each fixture.

**Manual spot-check (this run, read by hand):** all hints across the six fixtures point at the method or the next move — "Sum moments about A", "Write the equation for the second row and substitute z" — and none states a step's result. The one auto flag (03, step 4) is a false positive: hint 2 says the row reads $0x + 0y - 1z = 1$, and the `-1` it matched is a coefficient copied from the matrix the student already has, not the answer $z = -1$. Level-2 hints sometimes restate the equation the step starts from (03 steps 5–6); that is the intended "more specific" level, not a leak. Step granularity looks right for a junior: no merged steps, no placeholder text, one idea per step.

## 01-beam-determinate — Simply supported beam reactions

Known answer: R_A = 17 kN, R_B = 13 kN. 

- R_A = 17 ✓ (R_A)
- R_B = 13 ✓ (R_B)
- round 0: verified, 4 steps, 0 failed check(s)

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Sum of moments about A** (equation, verified) — $\sum M_A = 0 \implies R_B L - P (2) - (w L) \left( \frac{L}{2} \right) = 0$
   - hint 1: What equilibrium equation can you use to find $R_B$ directly?
   - hint 2: Sum moments about $A$. Remember the distributed load acts at the center of the beam.
2. **Solve for $R_B$** (algebra, verified) — $\begin{aligned} R_B (6) - 12 (2) - (3 \cdot 6) (3) &= 0 \\ 6 R_B - 24 - 54 &= 0 \\ 6 R_B &= 78 \\ R_B &= 13\ \text{kN} \end{aligned}$
   - hint 1: Substitute $L=6$, $P=12$, and $w=3$ into the moment equation.
   - hint 2: Simplify the arithmetic to isolate $R_B$.
3. **Sum of vertical forces** (equation, verified) — $\sum F_y = 0 \implies R_A + R_B - P - w L = 0$
   - hint 1: Now that you have $R_B$, what equation can you use to find $R_A$?
   - hint 2: Sum the vertical forces. Upward forces equal downward forces.
4. **Solve for $R_A$** (algebra, verified) — $\begin{aligned} R_A + 13 - 12 - (3 \cdot 6) &= 0 \\ R_A + 13 - 12 - 18 &= 0 \\ R_A - 17 &= 0 \\ R_A &= 17\ \text{kN} \end{aligned}$
   - hint 1: Plug in $R_B = 13\ \text{kN}$ and the other known forces.
   - hint 2: Isolate $R_A$.
   - check question: Could we have found $R_A$ without finding $R_B$ first?

</details>

Manual hint spot-check: _(see the summary at the top of this file)_

## 02-propped-cantilever — Problem 7.18 — propped cantilever

Known answer: R_B = 3wL/8, R_A = 5wL/8, M_A = wL^2/8, zero moment at x = L/4. 

- R_B = 3*w*L/8 ✓ (R_B)
- R_A = 5*w*L/8 ✓ (R_A)
- M_A = w*L^2/8 ✓ (M_A)
- round 0: verified, 6 steps, 0 failed check(s)

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Write the compatibility equation at B** (equation, verified) — $\frac{R_B L^3}{3EI} - \frac{wL^4}{8EI} = 0$
   - hint 1: What are the standard deflection formulas for a cantilever under a uniform load and a tip load?
   - hint 2: Set the sum of the tip deflections to zero.
2. **Solve for the redundant reaction** (algebra, verified) — $R_B = \frac{3}{8}wL$
   - hint 1: Move the uniform load term to the other side and multiply by $\frac{3EI}{L^3}$.
   - hint 2: You should get $R_B$ as a fraction of $wL$.
3. **Find the vertical reaction at A** (equation, verified) — $R_A = wL - R_B = \frac{5}{8}wL$
   - hint 1: The total downward force is $wL$.
   - hint 2: Subtract the upward reaction at B from the total load.
4. **Find the reaction moment at A** (equation, verified) — $M_A = \frac{wL^2}{2} - R_B L = \frac{1}{8}wL^2$
   - hint 1: The uniform load creates a clockwise moment, while $R_B$ creates a counterclockwise moment.
   - hint 2: The reaction moment $M_A$ must balance the net moment from the loads.
5. **Set the bending moment equation to zero** (equation, verified) — $M(x) = R_A x - M_A - \frac{wx^2}{2} = 0$
   - hint 1: Make a cut at distance $x$ from A and sum moments.
   - hint 2: The internal moment $M(x)$ balances the reaction moment $M_A$, the moment from $R_A$, and the moment from the distributed load segment $wx$.
6. **Locate the point of zero bending moment** (result, verified) — $\begin{aligned} \frac{5}{8}wLx - \frac{1}{8}wL^2 - \frac{1}{2}wx^2 &= 0 \\ 4x^2 - 5Lx + L^2 &= 0 \\ x &= \frac{L}{4} \end{aligned}$
   - hint 1: Substitute $R_A$ and $M_A$ in terms of $w$ and $L$. Multiply the entire equation by $-8/w$ to simplify.
   - hint 2: Factor the resulting quadratic equation $(4x^2 - 5Lx + L^2 = 0)$ to find the roots.

</details>

Manual hint spot-check: _(see the summary at the top of this file)_

## 03-linear-system — 3×3 linear system by elimination

Known answer: x = 2, y = 3, z = −1. 

- x = 2 ✓ (x)
- y = 3 ✓ (y)
- z = -1 ✓ (z)
- round 0: partially_verified, 6 steps, 3 failed check(s): step 1 — this step contains math but has no check | step 2 — this step contains math but has no check | step 3 — this step contains math but has no check
- round 1: verified, 6 steps, 0 failed check(s)
- ⚠ step 4: hint contains the result "-1"

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Write the augmented matrix** (scaffold, verified) — $\begin{bmatrix} 2 & 1 & -1 & | & 8 \\ -3 & -1 & 2 & | & -11 \\ -2 & 1 & 2 & | & -3 \end{bmatrix}$
   - hint 1: Extract the coefficients of $x, y, z$ and the right-hand side constant for each equation.
   - hint 2: The first row is $2, 1, -1$ and $8$. Do the same for the other two equations.
2. **Eliminate x from the second and third rows** (algebra, verified) — $\begin{aligned} R_2 &\leftarrow 2R_2 + 3R_1 \\ R_3 &\leftarrow R_3 + R_1 \\ &\begin{bmatrix} 2 & 1 & -1 & | & 8 \\ 0 & 1 & 1 & | & 2 \\ 0 & 2 & 1 & | & 5 \end{bmatrix} \end{aligned}$
   - hint 1: Use row 1 to cancel the $-3$ in row 2 and the $-2$ in row 3.
   - hint 2: Try the operations $2R_2 + 3R_1$ for the second row, and $R_3 + R_1$ for the third row.
3. **Eliminate y from the third row** (algebra, verified) — $\begin{aligned} R_3 &\leftarrow R_3 - 2R_2 \\ &\begin{bmatrix} 2 & 1 & -1 & | & 8 \\ 0 & 1 & 1 & | & 2 \\ 0 & 0 & -1 & | & 1 \end{bmatrix} \end{aligned}$
   - hint 1: Use the new row 2 to eliminate the $2$ in the second column of row 3.
   - hint 2: Subtract twice row 2 from row 3.
4. **Solve for z** (equation, verified) — $-z = 1 \implies z = -1$
   - hint 1: Write the equation represented by the third row of the matrix.
   - hint 2: The third row means $0x + 0y - 1z = 1$.
5. **Solve for y** (equation, verified) — $y + z = 2 \implies y - 1 = 2 \implies y = 3$
   - hint 1: Write the equation for the second row and substitute $z$.
   - hint 2: The second row gives $y + z = 2$.
6. **Solve for x** (result, verified) — $2x + y - z = 8 \implies 2x + 3 - (-1) = 8 \implies 2x + 4 = 8 \implies x = 2$
   - hint 1: Write the equation for the first row and substitute $y$ and $z$.
   - hint 2: The first row gives $2x + y - z = 8$.

</details>

Manual hint spot-check: _(see the summary at the top of this file)_

## 04-definite-integral — Integral of x·eˣ from 0 to 1

Known answer: 1. 

- I = 1 ✓ (I)
- round 0: verified, 4 steps, 0 failed check(s)

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Choose parts $u$ and $dv$** (equation, verified) — $\begin{aligned}  u &= x \\  dv &= e^x \, dx \\  du &= dx \\  v &= e^x \end{aligned}$
   - hint 1: What should we pick for $u$ so that its derivative simplifies the expression?
   - hint 2: Let $u = x$ and $dv = e^x \, dx$. Find their respective derivative and integral, $du$ and $v$.
2. **Apply the integration by parts formula** (substitution, verified) — $I = \left[ x e^x \right]_0^1 - \int_0^1 e^x \, dx$
   - hint 1: The formula for definite integrals is $\int_a^b u \, dv = \left[ uv \right]_a^b - \int_a^b v \, du$.
   - hint 2: Substitute $u = x$, $v = e^x$, and $du = dx$ into the definite integration by parts formula.
3. **Evaluate the boundary term and the integral** (algebra, verified) — $I = (1 \cdot e^1 - 0 \cdot e^0) - \left[ e^x \right]_0^1$
   - hint 1: Plug the upper and lower limits into $x e^x$.
   - hint 2: The antiderivative of $e^x$ is $e^x$. Set up its evaluation from $0$ to $1$.
4. **Compute the final value** (result, verified) — $I = e - (e - 1) = 1$
   - hint 1: Evaluate $\left[ e^x \right]_0^1$.
   - hint 2: Subtract the evaluated integral from the evaluated boundary term. Note that $e^0 = 1$.

</details>

Manual hint spot-check: _(see the summary at the top of this file)_

## 05-first-order-ode — First-order linear ODE

Known answer: y(t) = 2 − e^{−2t}. 

- y = 2 - exp(-2*t) ✓ (y)
- round 0: verified, 5 steps, 0 failed check(s)

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Find the integrating factor** (equation, verified) — $\mu(t) = e^{\int 2 \, dt} = e^{2t}$
   - hint 1: What is the integrating factor for this differential equation?
   - hint 2: Use $\mu(t) = e^{\int p(t) dt}$ with $p(t) = 2$.
2. **Multiply the ODE by the integrating factor** (equation, verified) — $\frac{d}{dt} \left( e^{2t} y \right) = 4 e^{2t}$
   - hint 1: Multiply both sides of the ODE by $e^{2t}$.
   - hint 2: The left side condenses to the derivative of $(e^{2t}y)$ by the product rule.
   - check question: What happens if we expand the left side using the product rule?
3. **Integrate both sides** (algebra, verified) — $\begin{aligned}  e^{2t} y &= \int 4 e^{2t} \, dt = 2 e^{2t} + C \\  y(t) &= 2 + C e^{-2t} \end{aligned}$
   - hint 1: Integrate both sides with respect to $t$. Don't forget the constant of integration.
   - hint 2: The integral of $4 e^{2t}$ is $2 e^{2t}$. Divide the resulting equation by $e^{2t}$ to solve for $y(t)$.
4. **Apply the initial condition** (substitution, verified) — $y(0) = 2 + C e^0 = 1 \implies C = -1$
   - hint 1: Plug in the given initial condition $y(0)=1$.
   - hint 2: Substitute $t=0$ and set the expression for $y$ equal to $1$. Solve for $C$.
5. **Final answer** (result, verified) — $y(t) = 2 - e^{-2t}$
   - hint 1: Put the value of $C$ into your general solution.
   - hint 2: Replace $C$ with $-1$ in $y(t) = 2 + C e^{-2t}$.

</details>

Manual hint spot-check: _(see the summary at the top of this file)_

## 06-conceptual-deflection — Simply supported vs. fixed–fixed deflection

Known answer: The simply supported beam, about 5 times larger. 

- ratio = 5 ✓ (factor)
- mentions "simply supported" ✓
- round 0: verified, 3 steps, 0 failed check(s)

<details><summary>Board as planned (titles, math, hints)</summary>

1. **Deflection of a simply supported beam** (equation, verified) — $\Delta_1 = \frac{5wL^4}{384EI}$
   - hint 1: Recall the standard deflection formula for a simply supported beam with a uniform distributed load.
   - hint 2: The formula involves a factor of $5/384$.
2. **Deflection of a fixed-fixed beam** (equation, verified) — $\Delta_2 = \frac{wL^4}{384EI}$
   - hint 1: Recall the standard deflection formula for a fixed-fixed beam with a uniform load.
   - hint 2: The fixed ends provide resisting moments that reduce the deflection compared to a simply supported beam. The formula has a factor of $1/384$.
3. **Compare the deflections** (result, verified) — $\frac{\Delta_1}{\Delta_2} = 5$
   - hint 1: Divide the simply supported beam deflection by the fixed-fixed beam deflection.
   - hint 2: The terms $wL^4$ and $384EI$ cancel out.

</details>

Manual hint spot-check: _(see the summary at the top of this file)_
