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
