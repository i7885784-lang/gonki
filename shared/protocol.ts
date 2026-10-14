import { z } from "zod";
export type Role = "driver" | "codriver";
export type Phase =
  "lobby" | "ready" | "countdown" | "racing" | "paused" | "finished";
export type Player = {
  id: string;
  role: Role;
  name?: string;
  ready: boolean;
  connected: boolean;
  resume: boolean;
};
export type Snapshot = {
  seq: number;
  epoch: number;
  p: { x: number; y: number; z: number };
  q: { x: number; y: number; z: number; w: number };
  speed: number;
  progress: number;
  checkpoint: number;
  time: number;
};
export type RoomState = {
  code: string;
  host: string;
  players: Player[];
  phase: Phase;
  epoch: number;
  startAt: number;
  elapsed: number;
  penalty: number;
  checkpoint: number;
  progress: number;
  resets: number;
  recovery: number;
  best: number | null;
  swap: string | null;
  expiresAt: number;
  pausedAt: number;
  result: number | null;
  snapshot: Snapshot | null;
  serverNow: number;
};
const num = z.number().finite();
const vec = z
  .object({
    x: num.min(-5000).max(5000),
    y: num.min(-300).max(1000),
    z: num.min(-5000).max(5000),
  })
  .strict();
export const messageSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("name"), name: z.string().trim().min(1).max(24) })
    .strict(),
  z
    .object({ type: z.literal("role"), role: z.enum(["driver", "codriver"]) })
    .strict(),
  z.object({ type: z.literal("random-roles") }).strict(),
  z.object({ type: z.literal("auth"), token: z.string().uuid() }).strict(),
  z.object({ type: z.literal("ready"), value: z.boolean() }).strict(),
  ...(
    [
      "start",
      "pause",
      "resume",
      "lobby",
      "restart",
      "swap",
      "leave",
      "ping",
      "voice-ready",
      "voice-stop",
    ] as const
  ).map((type) => z.object({ type: z.literal(type) }).strict()),
  z.object({ type: z.literal("reset"), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("call"),
      call: z.enum(["Тормози", "Лево", "Право"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("signal"),
      data: z.union([
        z.object({
          description: z.object({
            type: z.enum(["offer", "answer"]),
            sdp: z.string().max(20000),
          }),
        }),
        z.object({
          candidate: z.object({
            candidate: z.string().max(2000),
            sdpMid: z.string().nullable().optional(),
            sdpMLineIndex: z.number().nullable().optional(),
            usernameFragment: z.string().nullable().optional(),
          }),
        }),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("snapshot"),
      seq: num.int().nonnegative(),
      epoch: num.int(),
      p: vec,
      q: z.object({
        x: num.min(-1).max(1),
        y: num.min(-1).max(1),
        z: num.min(-1).max(1),
        w: num.min(-1).max(1),
      }),
      speed: num.min(-30).max(85),
    })
    .strict(),
]);
export type ClientMessage = z.infer<typeof messageSchema>;
export type ServerMessage =
  | { type: "state"; state: RoomState; you: string }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "error"; message: string }
  | { type: "pong"; now: number }
  | { type: "call"; call: string }
  | { type: "voice-ready" | "voice-stop" }
  | { type: "signal"; data: any };
export const roleName = (role: Role) =>
  role === "driver" ? "Водитель" : "Штурман";
export const elapsed = (s: RoomState, now: number) =>
  s.elapsed + (s.phase === "racing" ? Math.max(0, now - s.startAt) : 0);
