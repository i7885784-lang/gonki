import { body, codePattern, err, type VoiceConfig } from "./room";
export interface RouterEnv extends VoiceConfig {
  ROOMS: {
    idFromName(code: string): unknown;
    get(id: any): { fetch(req: Request): Promise<Response> };
  };
  ASSETS: { fetch(req: Request): Promise<Response> };
  CREATE_LIMIT: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  JOIN_LIMIT: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
export default {
  async fetch(req: Request, env: RouterEnv): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.headers.get("Origin") && req.headers.get("Origin") !== url.origin)
      return err("Запрос с другого сайта запрещён", 403);
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    try {
      if (url.pathname === "/api/rooms" && req.method === "POST") {
        if (!(await env.CREATE_LIMIT.limit({ key: ip })).success)
          return err("Слишком много комнат. Подождите минуту.", 429);
        const data = await body(req);
        if (!["driver", "codriver"].includes(data.role))
          return err("Выберите роль");
        for (let i = 0; i < 4; i++) {
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          const bytes = crypto.getRandomValues(new Uint8Array(8));
          const code = Array.from(bytes, (b) => alphabet[b % 32]).join("");
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const result = await stub.fetch(
            new Request("https://room/init", {
              method: "POST",
              body: JSON.stringify({ code, role: data.role }),
            }),
          );
          if (result.status !== 409) return result;
        }
        return err("Не удалось создать комнату", 503);
      }
      const match = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/(join|ws|ice)$/,
      );
      if (!match) return err("Адрес не найден", 404);
      const code = match[1].toUpperCase();
      if (!codePattern.test(code))
        return err("Код должен содержать 8 латинских букв или цифр");
      if (
        match[2] === "join" &&
        !(await env.JOIN_LIMIT.limit({ key: ip })).success
      )
        return err("Слишком много попыток. Подождите минуту.", 429);
      if (
        match[2] === "ws" &&
        !(await env.JOIN_LIMIT.limit({ key: ip + ":ws" })).success
      )
        return err("Слишком много подключений", 429);
      if (req.method === "POST") {
        const payload = await body(req);
        const headers = new Headers(req.headers);
        headers.delete("content-length");
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
          new Request("https://room/" + match[2], {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          }),
        );
      }
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
        new Request("https://room/" + match[2], req),
      );
    } catch {
      return err("Не удалось обработать запрос", 400);
    }
  },
};
