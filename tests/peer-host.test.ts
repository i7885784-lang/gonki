import { it, expect } from "vitest";
import { BrowserHost } from "../src/peer-host";
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
};
it("комната браузера сериализует конкурентные входы и сохраняет два места", async () => {
  const room = new BrowserHost("ABCDEFGH", memory());
  try {
    await room.run(() =>
      room.engine.fetch(
        new Request("https://room/init", {
          method: "POST",
          body: JSON.stringify({ code: room.code, role: "driver" }),
        }),
      ),
    );
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        room.run(() =>
          room.engine.fetch(
            new Request("https://room/join", { method: "POST", body: "{}" }),
          ),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409, 409,
    ]);
  } finally {
    room.stop();
  }
});
it("перезагрузка организатора восстанавливает роли и токен, ставит гонку на паузу", async () => {
  const store = memory();
  const original = new BrowserHost("ABCDEFGH", store);
  await original.run(() =>
    original.engine.fetch(
      new Request("https://room/init", {
        method: "POST",
        body: JSON.stringify({ code: original.code, role: "codriver" }),
      }),
    ),
  );
  const token = Object.keys(original.engine.tokens)[0];
  original.engine.s!.phase = "racing";
  original.engine.s!.players[0].connected = true;
  await original.engine.save();
  const restored = new BrowserHost("ABCDEFGH", store, true);
  try {
    const joined = await restored.run(() =>
      restored.engine.fetch(
        new Request("https://room/join", {
          method: "POST",
          body: JSON.stringify({ token }),
        }),
      ),
    );
    expect(joined.status).toBe(200);
    expect(restored.engine.s!.players).toHaveLength(1);
    expect(restored.engine.s!.players[0].role).toBe("codriver");
    expect(restored.engine.s!.phase).toBe("paused");
    expect(restored.engine.s!.players[0].connected).toBe(false);
  } finally {
    original.stop();
    restored.stop();
  }
  expect(store.getItem("rally-host:ABCDEFGH")).toBeNull();
});

it("имена и роли меняются в лобби, сохраняют уникальные места и сбрасывают готовность", async () => {
  const room = new BrowserHost("ABCDEFGH", memory());
  const socket = () => {
    let attachment: unknown;
    return {
      send: (_: string) => {},
      close: () => {},
      serializeAttachment: (value: unknown) => {
        attachment = value;
      },
      deserializeAttachment: () => attachment,
    };
  };
  try {
    const init = await room.run(() =>
      room.engine.fetch(
        new Request("https://room/init", {
          method: "POST",
          body: JSON.stringify({ code: room.code, role: "driver" }),
        }),
      ),
    );
    const first = (await init.json()) as { token: string };
    const join = await room.run(() =>
      room.engine.fetch(
        new Request("https://room/join", { method: "POST", body: "{}" }),
      ),
    );
    const second = (await join.json()) as { token: string };
    const a = socket(),
      b = socket();
    const send = (link: ReturnType<typeof socket>, message: unknown) =>
      room.run(() =>
        room.engine.webSocketMessage(link, JSON.stringify(message)),
      );
    await room.run(() => room.engine.acceptSocket(a));
    await room.run(() => room.engine.acceptSocket(b));
    await send(a, { type: "auth", token: first.token });
    await send(b, { type: "auth", token: second.token });
    await send(b, { type: "name", name: "  Саша  " });
    expect(room.engine.s!.players[1].name).toBe("Саша");
    await send(a, { type: "ready", value: true });
    await send(b, { type: "ready", value: true });
    expect(room.engine.s!.phase).toBe("ready");
    await send(b, { type: "role", role: "driver" });
    expect(room.engine.s!.players.map((p) => p.role)).toEqual([
      "codriver",
      "driver",
    ]);
    expect(room.engine.s!.players.every((p) => !p.ready)).toBe(true);
    expect(room.engine.s!.phase).toBe("lobby");
    await send(a, { type: "random-roles" });
    expect(new Set(room.engine.s!.players.map((p) => p.role)).size).toBe(2);
    room.engine.s!.phase = "racing";
    const roles = room.engine.s!.players.map((p) => p.role);
    await send(b, { type: "role", role: "codriver" });
    expect(room.engine.s!.players.map((p) => p.role)).toEqual(roles);
  } finally {
    room.stop();
  }
});
