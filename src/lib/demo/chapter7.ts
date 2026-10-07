// Original sample material for the demo session, written for CHIRON (free to include).
// "Structural Mechanics — Course Notes", Chapter 7. Printed pages 340–344.
//
// Conventions are stated on p. 340 and used consistently; every result below was checked
// symbolically (see docs/PLAN.md). Lines of the form [[fig:key]] render a figure.

export interface DemoPage {
  label: string; // printed page number
  markdown: string;
  /** Plain-language description of any figures, sent to the model with the page text. */
  figures?: string;
}

export const DEMO_DOCUMENT_ID = "demo-ch7";
export const DEMO_DOCUMENT_TITLE = "Structural Mechanics — Ch. 7 Statically Indeterminate Beams";
export const DEMO_START_PAGE = 2; // p. 341, the superposition method

export const PROBLEM_7_18 = String.raw`**7.18** A propped cantilever $AB$ of length $L$ and constant flexural rigidity $EI$ is fixed at $A$ and supported by a roller at $B$. It carries a uniformly distributed load of intensity $w$ over its entire length (Fig. P7.18).

(a) Taking the roller reaction $R_B$ as the redundant, write the compatibility equation at $B$.\
(b) Determine $R_B$, the vertical reaction $R_A$, and the fixed-end moment $M_A$.\
(c) Locate the point of zero bending moment between $A$ and $B$.`;

export const DEMO_PAGES: DemoPage[] = [
  {
    label: "340",
    markdown: String.raw`# 7 · Statically Indeterminate Beams

## 7.1 When equilibrium is not enough

A beam is **statically indeterminate** when it has more support reactions than independent equilibrium equations. For a planar beam there are three equations ($\sum F_x = 0$, $\sum F_y = 0$, $\sum M = 0$), so the degree of indeterminacy is

$$
n = r - 3 \tag{7.4}
$$

where $r$ is the number of reaction components. A **propped cantilever** — fixed at one end, roller at the other — has $r = 4$ ($A_x$, $A_y$, $M_A$, $R_B$), so $n = 1$. The missing equation must come from how the beam *deforms*.

### Notation and sign conventions (used throughout this chapter)

- $x$ is measured from the left support $A$, positive to the right.
- $v(x)$ is the transverse deflection, **positive upward**; $v' = dv/dx$ is the slope.
- $w$ is the distributed load intensity, **positive downward**.
- Bending moment $M$ is **positive when it compresses the top fibers** (sagging).
- Reactions are positive upward; a fixed-end moment $M_A$ is positive counterclockwise.

With these conventions the Euler–Bernoulli beam relations are

$$
EI\,v''(x) = M(x) \tag{7.1}
$$
$$
\frac{dM}{dx} = V \tag{7.2}
$$
$$
\frac{dV}{dx} = -w \tag{7.3}
$$

### Boundary conditions

| Support | Kinematic | Static |
|---|---|---|
| Fixed | $v = 0$, $v' = 0$ | — |
| Pin or roller | $v = 0$ | $M = 0$ (no applied couple) |
| Free end | — | $M = 0$, $V = 0$ |`,
  },
  {
    label: "341",
    markdown: String.raw`## 7.2 The method of superposition

The idea: **remove** enough supports to make the beam determinate, compute what the removed supports would have prevented, then **put the reactions back** with exactly the magnitude needed to undo it.

1. Choose a **redundant** reaction — for a propped cantilever, usually the roller reaction $R_B$.
2. Remove it. The remaining *released structure* is a cantilever, which is determinate.
3. Find the deflection at $B$ of the released structure under (0) the applied loads and (1) the redundant alone. By superposition (linear-elastic, small deflections),

   $$
   v_B = v_B^{(0)} + v_B^{(1)} \tag{7.5}
   $$

4. Impose **compatibility**: the real support does not let $B$ move vertically, so

   $$
   v_B = 0 \tag{7.6}
   $$

   Solve for the redundant; the remaining reactions follow from statics.

The compatibility equation is the "extra" equation that equilibrium could not supply.

### Table 7.1 — Cantilever tip deflections (fixed at $A$, free at $B$, length $L$)

| Loading on the cantilever | Tip deflection $v_B$ | |
|---|---|---|
| Uniform load $w$ (downward) over full length | $-\dfrac{wL^4}{8EI}$ | (7.7) |
| Upward point load $R$ at the tip | $+\dfrac{RL^3}{3EI}$ | (7.8) |
| Downward point load $P$ at distance $a$ from $A$ | $-\dfrac{Pa^2(3L-a)}{6EI}$ | (7.9) |

Signs follow the conventions on p. 340: downward deflection is negative.

[[fig:released]]`,
    figures:
      "Figure 7.2: A propped cantilever (fixed at A, roller at B) is split into the released cantilever under the applied load, with downward tip deflection v_B^(0), plus the same cantilever under the upward redundant R_B alone, with upward tip deflection v_B^(1). The two tip deflections must cancel.",
  },
  {
    label: "342",
    markdown: String.raw`## 7.3 Worked example

**Example 7.4** A propped cantilever $AB$ of length $L$ (fixed at $A$, roller at $B$) carries a downward point load $P$ at midspan. Find the reactions.

*Released structure.* Remove the roller and take $R_B$ (upward) as the redundant.

*Load alone.* From Eq. (7.9) with $a = L/2$:
$$
v_B^{(0)} = -\frac{P(L/2)^2\,(3L - L/2)}{6EI} = -\frac{5PL^3}{48EI} \tag{7.10}
$$

*Redundant alone.* From Eq. (7.8) with $R = R_B$:
$$
v_B^{(1)} = \frac{R_B L^3}{3EI} \tag{7.11}
$$

*Compatibility.* Since $B$ cannot move vertically, Eq. (7.6) gives
$$
\frac{R_B L^3}{3EI} - \frac{5PL^3}{48EI} = 0 \quad\Rightarrow\quad R_B = \frac{5P}{16} \tag{7.12}
$$

*Statics.* $\sum F_y = 0$: $R_A = P - R_B = \dfrac{11P}{16}$. Moments about $A$ (counterclockwise positive): $M_A + R_B L - P\dfrac{L}{2} = 0$, so $M_A = \dfrac{3PL}{16}$.

Note that $R_B < P/2$: the fixed end is stiffer than the roller, so it attracts more of the load. **Symmetry arguments do not apply when the two supports differ.**

[[fig:example74]]`,
    figures:
      "Figure 7.3 (Example 7.4): beam AB, fixed wall at left end A, roller at right end B, downward point load P at midspan L/2. Reactions drawn: R_A upward and counterclockwise moment M_A at A, R_B upward at B.",
  },
  {
    label: "343",
    markdown: String.raw`## 7.4 The method of integration (alternative)

Instead of superposition, write $M(x)$ in terms of the unknown redundant, integrate Eq. (7.1) twice, and use **all** the boundary conditions. For a propped cantilever:

$$
v(0) = 0, \qquad v'(0) = 0, \qquad v(L) = 0 \tag{7.13}
$$

Two of these fix the integration constants; the third determines the redundant. The static condition at the roller,
$$
M(L) = 0 \tag{7.14}
$$
is satisfied automatically if $M(x)$ was written correctly — a useful check.

### Locating zero moment

Between a fixed end and a roller the moment changes sign: hogging ($M < 0$) near the fixed end, sagging ($M > 0$) further along. The **point of contraflexure** is where $M(x) = 0$; the curvature $v''$ changes sign there by Eq. (7.1). The maximum sagging moment occurs where $V = dM/dx = 0$, Eq. (7.2).

### Common mistakes

- Using a cantilever formula with the wrong sign for the redundant: $R_B$ acts **upward**, so its deflection term in Eq. (7.5) is positive.
- Treating $EI$ as varying when it is constant (or vice versa).
- Forgetting that $M_A$ is part of the moment equilibrium about any point other than $A$.`,
  },
  {
    label: "344",
    markdown: String.raw`## Problems

**7.16** A propped cantilever carries a downward point load $P$ at distance $a$ from the fixed end. Show that $R_B = \dfrac{Pa^2(3L - a)}{2L^3}$.

**7.17** Repeat Example 7.4 using the method of integration, and verify Eq. (7.14).

${PROBLEM_7_18}

[[fig:p718]]

**7.19** A beam fixed at both ends carries a uniform load $w$. Taking $M_B$ and $R_B$ as redundants, write the two compatibility equations.

**7.20** For the beam of Problem 7.18, find the maximum sagging moment and where it occurs.`,
    figures:
      "Figure P7.18: horizontal beam AB of length L. Left end A is built into a wall (fixed). Right end B rests on a roller. A uniformly distributed downward load of intensity w acts over the full length from A to B. EI constant.",
  },
];

export const DEMO_TASK_LABEL = "Problem 7.18 — Propped cantilever (hyperstatic beam)";
export const DEMO_TASK_PAGE = 5;
export const DEMO_STEP = "Setting up the compatibility equation at B";
