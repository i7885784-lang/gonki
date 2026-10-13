export type Vec3 = { x: number; y: number; z: number };
// Метрическая осевая линия: лес, подъём, шпилька, спуск. Одна геометрия для всех систем.
const anchors: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, 120],
  [25, 3, 250],
  [100, 8, 370],
  [205, 12, 460],
  [275, 20, 585],
  [260, 28, 710],
  [160, 40, 820],
  [60, 52, 910],
  [40, 64, 1030],
  [130, 74, 1120],
  [270, 80, 1160],
  [380, 88, 1230],
  [410, 92, 1330],
  [350, 93, 1370],
  [300, 88, 1310],
  [235, 76, 1250],
  [140, 65, 1285],
  [70, 55, 1410],
  [130, 48, 1540],
  [275, 38, 1590],
  [430, 27, 1670],
  [470, 20, 1790],
  [380, 14, 1900],
  [230, 8, 1950],
  [180, 3, 2070],
  [205, 0, 2200],
];
function spline(a: number, b: number, c: number, d: number, t: number) {
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t)
  );
}
export const route: (Vec3 & { s: number })[] = [];
for (let i = 0; i < anchors.length - 1; i++) {
  const a = anchors[Math.max(0, i - 1)],
    b = anchors[i],
    c = anchors[i + 1],
    d = anchors[Math.min(anchors.length - 1, i + 2)];
  const n = Math.ceil(Math.hypot(c[0] - b[0], c[2] - b[2]) / 3);
  for (let j = 0; j < n; j++) {
    const t = j / n,
      p = {
        x: spline(a[0], b[0], c[0], d[0], t),
        y: spline(a[1], b[1], c[1], d[1], t),
        z: spline(a[2], b[2], c[2], d[2], t),
        s: 0,
      };
    const prev = route.at(-1);
    p.s = prev
      ? prev.s + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)
      : 0;
    route.push(p);
  }
}
const last = anchors.at(-1)!;
const prev = route.at(-1)!;
route.push({
  x: last[0],
  y: last[1],
  z: last[2],
  s: prev.s + Math.hypot(last[0] - prev.x, last[1] - prev.y, last[2] - prev.z),
});
// Плавные реальные перегибы поверхности; заметки о гребнях ниже выводятся из высоты.
for (const point of route) {
  for (const center of [400, 1020, 2440]) {
    point.y += 4 * Math.exp(-(((point.s - center) / 30) ** 2));
  }
}
for (let i = 1; i < route.length; i++) {
  const a = route[i - 1],
    b = route[i];
  b.s = a.s + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
export const LENGTH = route.at(-1)!.s;
export const ROAD_WIDTH = 12;
export function at(s: number) {
  let i = route.findIndex((p) => p.s >= Math.max(0, s));
  if (i < 0) i = route.length - 1;
  const p = route[i],
    a = route[Math.max(0, i - 1)],
    b = route[Math.min(route.length - 1, i + 1)];
  return { ...p, index: i, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}
export const checkpoints = Array.from(
  { length: Math.floor(LENGTH / 130) },
  (_, i) => at((i + 1) * 130),
);
checkpoints.push(at(LENGTH - 12));
export function project(pos: Vec3, previous: number, window = 85) {
  let best = Infinity,
    answer = at(previous);
  for (const p of route) {
    if (p.s < previous - window || p.s > previous + window) continue;
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d < best) {
      best = d;
      answer = at(p.s);
    }
  }
  return { ...answer, distance: best };
}
export type Note = {
  s: number;
  text: string;
  kind: "left" | "right" | "crest" | "caution";
  severity?: number;
};
export const notes: Note[] = [];
// Объединяем непрерывную дугу одного направления: одна заметка на поворот,
// степень — по самому крутому участку, расстояние — до входа в дугу.
let corner: { start: number; sign: number; peak: number } | null = null;
function finishCorner() {
  if (!corner || corner.peak < 7) {
    corner = null;
    return;
  }
  const severity =
    corner.peak > 65
      ? 1
      : corner.peak > 45
        ? 2
        : corner.peak > 30
          ? 3
          : corner.peak > 20
            ? 4
            : corner.peak > 12
              ? 5
              : 6;
  notes.push({
    s: corner.start,
    text: `${corner.sign > 0 ? "Право" : "Лево"} ${severity}${severity === 1 ? " · шпилька" : ""}`,
    kind: corner.sign > 0 ? "right" : "left",
    severity,
  });
  corner = null;
}
for (let i = 18; i < route.length - 18; i += 3) {
  const a = route[i - 16],
    b = route[i],
    c = route[i + 16];
  let delta =
    Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  const degrees = (Math.abs(delta) * 180) / Math.PI,
    sign = Math.sign(delta);
  if (degrees < 4) {
    finishCorner();
    continue;
  }
  if (corner && corner.sign !== sign) finishCorner();
  corner ??= { start: Math.max(50, b.s - 35), sign, peak: 0 };
  corner.peak = Math.max(corner.peak, degrees);
}
finishCorner();
let lastCrest = -200;
for (let i = 8; i < route.length - 8; i++) {
  const a = route[i - 7],
    b = route[i],
    c = route[i + 7];
  if (b.y - a.y > 0.12 && c.y - b.y < -0.12 && b.s - lastCrest > 120) {
    notes.push({ s: b.s, text: "Гребень · осторожно", kind: "crest" });
    lastCrest = b.s;
  }
}
notes.sort((a, b) => a.s - b.s);
export function roadStrip(halfWidth: number, drop = 0) {
  const vertices: number[] = [],
    indices: number[] = [];
  const first = at(0),
    last = at(LENGTH);
  const surface = [
    {
      ...first,
      x: first.x - Math.sin(first.yaw) * 35,
      z: first.z - Math.cos(first.yaw) * 35,
    },
    ...route,
    {
      ...last,
      x: last.x + Math.sin(last.yaw) * 35,
      z: last.z + Math.cos(last.yaw) * 35,
    },
  ];
  surface.forEach((p, i) => {
    const a = surface[Math.max(0, i - 1)],
      b = surface[Math.min(surface.length - 1, i + 1)],
      yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (const side of [-1, 1])
      vertices.push(
        p.x + Math.cos(yaw) * halfWidth * side,
        p.y - drop,
        p.z - Math.sin(yaw) * halfWidth * side,
      );
    if (i < surface.length - 1) {
      const j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  });
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}
