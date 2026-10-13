import { route, LENGTH, checkpoints, notes, at } from "../shared/track";
import type { Snapshot } from "../shared/protocol";
export class RallyMap {
  ctx: CanvasRenderingContext2D;
  follow = false;
  headingUp = false;
  zoom = 1;
  pan = { x: 0, y: 0 };
  latest?: Snapshot;
  previous?: Snapshot;
  received = 0;
  drag?: { x: number; y: number };
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    canvas.onpointerdown = (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      this.follow = false;
    };
    canvas.onpointermove = (e) => {
      if (this.drag) {
        this.pan.x += e.clientX - this.drag.x;
        this.pan.y += e.clientY - this.drag.y;
        this.drag = { x: e.clientX, y: e.clientY };
      }
    };
    canvas.onpointerup = () => (this.drag = undefined);
    canvas.onpointercancel = () => (this.drag = undefined);
    canvas.onwheel = (e) => {
      e.preventDefault();
      this.zoom = Math.max(
        0.7,
        Math.min(12, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)),
      );
    };
  }
  update(s: Snapshot) {
    if (
      this.latest &&
      s.epoch === this.latest.epoch &&
      s.seq <= this.latest.seq
    )
      return;
    this.previous = this.latest?.epoch === s.epoch ? this.latest : s;
    this.latest = s;
    this.received = performance.now();
  }
  overview() {
    this.follow = false;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }
  returnToCar() {
    this.follow = true;
    this.zoom = 4;
    this.pan = { x: 0, y: 0 };
  }
  draw() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    if (
      this.canvas.width !== box.width * dpr ||
      this.canvas.height !== box.height * dpr
    ) {
      this.canvas.width = box.width * dpr;
      this.canvas.height = box.height * dpr;
    }
    const c = this.ctx,
      w = box.width,
      h = box.height;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#dbe4d5";
    c.fillRect(0, 0, w, h);
    const t = Math.min(1, (performance.now() - this.received) / 90),
      a = this.previous,
      b = this.latest;
    const p = b
      ? {
          x: (a?.p.x ?? b.p.x) + (b.p.x - (a?.p.x ?? b.p.x)) * t,
          z: (a?.p.z ?? b.p.z) + (b.p.z - (a?.p.z ?? b.p.z)) * t,
        }
      : at(0);
    const yaw = b
      ? Math.atan2(
          2 * (b.q.w * b.q.y + b.q.x * b.q.z),
          1 - 2 * (b.q.y * b.q.y + b.q.x * b.q.x),
        )
      : 0;
    const scale = Math.min((w - 90) / 640, (h - 75) / 2250) * this.zoom;
    c.save();
    c.translate(w / 2 + this.pan.x, h / 2 + this.pan.y);
    if (this.headingUp && this.follow) c.rotate(-yaw);
    c.scale(scale, -scale);
    const cx = this.follow ? p.x : 230,
      cz = this.follow ? p.z : 1100;
    c.translate(-cx, -cz);
    c.strokeStyle = "#c2cebd";
    c.lineWidth = 1 / scale;
    for (let x = -500; x < 1200; x += 100) {
      c.beginPath();
      c.moveTo(x, -500);
      c.lineTo(x, 2700);
      c.stroke();
    }
    for (let z = -500; z < 2700; z += 100) {
      c.beginPath();
      c.moveTo(-500, z);
      c.lineTo(1200, z);
      c.stroke();
    }
    const line = (points: typeof route, color: string, width: number) => {
      c.strokeStyle = color;
      c.lineWidth = width / scale;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      points.forEach((p, i) => (i ? c.lineTo(p.x, p.z) : c.moveTo(p.x, p.z)));
      c.stroke();
    };
    line(route, "#f8faf0", 10);
    line(route, "#7f8c77", 4);
    line(
      route.filter((p) => p.s <= (b?.progress ?? 0)),
      "#dd673d",
      5,
    );
    for (const cp of checkpoints) {
      c.fillStyle = cp.s < (b?.progress ?? 0) ? "#dd673d" : "#fff";
      c.strokeStyle = "#6b7966";
      c.lineWidth = 1.5 / scale;
      c.beginPath();
      c.arc(cp.x, cp.z, 3.5 / scale, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    const label = (s: number, text: string) => {
      const p = at(s);
      c.save();
      c.translate(p.x + 12 / scale, p.z);
      c.scale(1 / scale, -1 / scale);
      c.fillStyle = "#26382d";
      c.font = "bold 11px sans-serif";
      c.fillText(text, 0, 4);
      c.restore();
    };
    label(0, "СТАРТ");
    label(LENGTH, "ФИНИШ");
    if (this.zoom > 2)
      for (const n of notes.filter(
        (n) => n.s > (b?.progress ?? 0) && n.s < (b?.progress ?? 0) + 500,
      ))
        label(n.s, n.text);
    c.save();
    c.translate(p.x, p.z);
    c.rotate(-yaw);
    c.fillStyle = "#ed653a";
    c.strokeStyle = "white";
    c.lineWidth = 2 / scale;
    c.beginPath();
    c.moveTo(0, 12 / scale);
    c.lineTo(-7 / scale, -7 / scale);
    c.lineTo(0, -3 / scale);
    c.lineTo(7 / scale, -7 / scale);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    c.restore();
    c.fillStyle = "#63725d";
    c.font = "11px sans-serif";
    c.fillText(this.headingUp && this.follow ? "Курс ↑" : "С ↑", 18, 26);
    c.fillText("СОСНОВЫЙ ПЕРЕВАЛ", 18, h - 18);
  }
}
