// Line drawings for the demo chapter, in the page's ink.

const INK = "var(--ink-soft)";
const LOAD = "var(--chiron)";

function Wall({ x, y, h = 56 }: { x: number; y: number; h?: number }) {
  const hatches = Array.from({ length: Math.floor(h / 8) + 1 }, (_, i) => y - h / 2 + i * 8);
  return (
    <g stroke={INK} strokeWidth={1.2}>
      <line x1={x} y1={y - h / 2} x2={x} y2={y + h / 2} strokeWidth={2} />
      {hatches.map((hy) => (
        <line key={hy} x1={x} y1={hy} x2={x - 9} y2={hy + 9} />
      ))}
    </g>
  );
}

function Roller({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={INK} strokeWidth={1.2} fill="none">
      <polygon points={`${x},${y} ${x - 9},${y + 13} ${x + 9},${y + 13}`} fill="var(--paper)" />
      <circle cx={x - 5} cy={y + 17} r={3.4} />
      <circle cx={x + 5} cy={y + 17} r={3.4} />
      <line x1={x - 15} y1={y + 21} x2={x + 15} y2={y + 21} />
    </g>
  );
}

function Arrow({ x, y1, y2, color = LOAD, width = 1.2 }: { x: number; y1: number; y2: number; color?: string; width?: number }) {
  const dir = y2 > y1 ? 1 : -1;
  return (
    <g stroke={color} strokeWidth={width} fill={color}>
      <line x1={x} y1={y1} x2={x} y2={y2 - dir * 5} />
      <polygon points={`${x},${y2} ${x - 3.5},${y2 - dir * 7} ${x + 3.5},${y2 - dir * 7}`} stroke="none" />
    </g>
  );
}

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily="var(--font-serif)" fontStyle="italic" fontSize={15} fill="var(--ink)">
      {children}
    </text>
  );
}

function Dimension({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: React.ReactNode }) {
  return (
    <g stroke={INK} strokeWidth={0.9}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} />
      <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} />
      <g stroke="none">
        <Label x={(x1 + x2) / 2} y={y - 6}>
          {label}
        </Label>
      </g>
    </g>
  );
}

function Beam({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <rect x={x1} y={y - 4} width={x2 - x1} height={8} fill="var(--paper)" stroke={INK} strokeWidth={1.4} />;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <figcaption className="label mt-1 text-center normal-case tracking-normal">{children}</figcaption>;
}

function P718() {
  const xA = 70,
    xB = 430,
    y = 92;
  const arrows = Array.from({ length: 13 }, (_, i) => xA + 6 + (i * (xB - xA - 12)) / 12);
  return (
    <svg viewBox="0 0 500 160" className="w-full max-w-[460px]" role="img" aria-label="Propped cantilever with uniform load">
      <line x1={xA} y1={52} x2={xB} y2={52} stroke={LOAD} strokeWidth={1.2} />
      {arrows.map((x) => (
        <Arrow key={x} x={x} y1={52} y2={y - 6} />
      ))}
      <Label x={(xA + xB) / 2} y={44}>
        w
      </Label>
      <Wall x={xA} y={y} />
      <Beam x1={xA} x2={xB} y={y} />
      <Roller x={xB} y={y + 4} />
      <Label x={xA + 14} y={y + 26} anchor="start">
        A
      </Label>
      <Label x={xB + 20} y={y + 4} anchor="start">
        B
      </Label>
      <Dimension x1={xA} x2={xB} y={145} label="L" />
    </svg>
  );
}

function Example74() {
  const xA = 70,
    xB = 430,
    y = 82,
    xm = (xA + xB) / 2;
  return (
    <svg viewBox="0 0 500 170" className="w-full max-w-[460px]" role="img" aria-label="Propped cantilever with midspan point load">
      <Arrow x={xm} y1={30} y2={y - 6} width={1.6} />
      <Label x={xm + 10} y={40} anchor="start">
        P
      </Label>
      <Wall x={xA} y={y} />
      <Beam x1={xA} x2={xB} y={y} />
      <Roller x={xB} y={y + 4} />
      <Arrow x={xA + 18} y1={132} y2={y + 8} color={INK} />
      <Label x={xA + 26} y={128} anchor="start">
        R<tspan fontSize={11} dy={3}>A</tspan>
      </Label>
      <path d={`M ${xA + 28} ${y - 22} A 22 22 0 0 0 ${xA + 26} ${y + 22}`} fill="none" stroke={INK} strokeWidth={1.1} />
      <polygon points={`${xA + 26},${y + 22} ${xA + 33},${y + 17} ${xA + 33},${y + 26}`} fill={INK} />
      <Label x={xA + 36} y={y - 24} anchor="start">
        M<tspan fontSize={11} dy={3}>A</tspan>
      </Label>
      <Arrow x={xB} y1={140} y2={y + 30} color={INK} />
      <Label x={xB + 10} y={140} anchor="start">
        R<tspan fontSize={11} dy={3}>B</tspan>
      </Label>
      <Dimension x1={xA} x2={xm} y={160} label="L/2" />
      <Dimension x1={xm} x2={xB} y={160} label="L/2" />
    </svg>
  );
}

function ReleasedCantilever({ ox, up, y }: { ox: number; up: boolean; y: number }) {
  const x2 = ox + 170;
  const tip = up ? y - 22 : y + 22;
  return (
    <g>
      <Wall x={ox} y={y} h={44} />
      <Beam x1={ox} x2={x2} y={y} />
      <path d={`M ${ox} ${y} Q ${ox + 110} ${y} ${x2} ${tip}`} fill="none" stroke={INK} strokeDasharray="4 3" strokeWidth={1} />
      {up ? (
        <>
          <Arrow x={x2} y1={y + 46} y2={y + 8} />
          <Label x={x2 + 8} y={y + 46} anchor="start">
            R<tspan fontSize={11} dy={3}>B</tspan>
          </Label>
        </>
      ) : (
        Array.from({ length: 8 }, (_, i) => <Arrow key={i} x={ox + 8 + i * 22} y1={y - 34} y2={y - 6} />)
      )}
      <Label x={x2 + 6} y={up ? tip - 6 : tip + 14} anchor="start">
        v<tspan fontSize={11} dy={-7}>({up ? 1 : 0})</tspan>
        <tspan fontSize={11} dy={10} dx={-14}>
          B
        </tspan>
      </Label>
    </g>
  );
}

function Released() {
  const y = 62;
  return (
    <svg viewBox="0 0 520 130" className="w-full max-w-[480px]" role="img" aria-label="Released structure split into load case and redundant case">
      <ReleasedCantilever ox={30} up={false} y={y} />
      <text x={262} y={y + 6} fontFamily="var(--font-serif)" fontSize={22} fill="var(--ink)" textAnchor="middle">
        +
      </text>
      <ReleasedCantilever ox={300} up y={y} />
    </svg>
  );
}

const FIGURES: Record<string, { el: React.ReactNode; caption: string }> = {
  p718: { el: <P718 />, caption: "Fig. P7.18 — EI constant" },
  example74: { el: <Example74 />, caption: "Fig. 7.3 — Example 7.4" },
  released: { el: <Released />, caption: "Fig. 7.2 — Released structure: load case (0) plus redundant case (1)" },
};

export function Figure({ id }: { id: string }) {
  const f = FIGURES[id];
  if (!f) return null;
  return (
    <figure className="my-5 flex flex-col items-center">
      {f.el}
      <Caption>{f.caption}</Caption>
    </figure>
  );
}
