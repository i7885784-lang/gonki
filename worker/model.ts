import { at, checkpoints, project } from "../shared/track";
import {
  elapsed,
  type RoomState,
  type Player,
  type Snapshot,
} from "../shared/protocol";
export function initial(code: string, now = Date.now()): RoomState {
  return {
    code,
    host: "",
    players: [],
    phase: "lobby",
    epoch: 0,
    startAt: 0,
    elapsed: 0,
    penalty: 0,
    checkpoint: 0,
    progress: 0,
    resets: 0,
    recovery: 0,
    best: null,
    swap: null,
    expiresAt: now + 4 * 3600_000,
    pausedAt: 0,
    result: null,
    snapshot: null,
    serverNow: now,
  };
}
export function canStart(s: RoomState, p: Player) {
  return (
    p.id === s.host &&
    ["ready", "lobby"].includes(s.phase) &&
    s.players.length === 2 &&
    s.players.every((p) => p.connected && p.ready)
  );
}
export function pause(s: RoomState, now: number) {
  if (s.phase === "racing" || s.phase === "countdown") {
    s.elapsed = elapsed(s, now);
    s.phase = "paused";
    s.pausedAt = now;
    s.players.forEach((p) => (p.resume = false));
  }
}
export function clearRace(s: RoomState) {
  s.phase = "lobby";
  s.epoch++;
  s.startAt = 0;
  s.elapsed = 0;
  s.penalty = 0;
  s.checkpoint = 0;
  s.progress = 0;
  s.resets = 0;
  s.recovery++;
  s.snapshot = null;
  s.result = null;
  s.players.forEach((p) => {
    p.ready = false;
    p.resume = false;
  });
  s.swap = null;
}
export function validateMovement(
  s: RoomState,
  previous: Snapshot | null,
  next: Snapshot,
  dt: number,
) {
  if (
    s.phase !== "racing" ||
    next.epoch !== s.epoch ||
    next.seq <= (previous?.seq ?? -1)
  )
    return null;
  const norm = Math.hypot(next.q.x, next.q.y, next.q.z, next.q.w);
  if (norm < 0.9 || norm > 1.1) return null;
  const base = previous?.p ?? at(s.progress);
  if (
    Math.hypot(next.p.x - base.x, next.p.z - base.z) >
    Math.min(100, 85 * dt + 8)
  )
    return null;
  const pos = project(next.p, s.progress);
  if (pos.distance > 90 || Math.abs(next.p.y - pos.y) > 40) return null;
  return pos;
}
export function advance(s: RoomState, position: ReturnType<typeof project>) {
  s.progress = position.s;
  const cp = checkpoints[s.checkpoint];
  if (
    cp &&
    position.s >= cp.s - 10 &&
    position.s < cp.s + 40 &&
    position.distance < 12
  )
    s.checkpoint++;
  return s.checkpoint === checkpoints.length;
}
