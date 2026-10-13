import type {
  ClientMessage,
  RoomState,
  ServerMessage,
  Snapshot,
} from "../shared/protocol";
export class Network {
  ws?: WebSocket;
  token = "";
  code = "";
  you = "";
  state?: RoomState;
  connected = false;
  stopped = false;
  offset = 0;
  lastHeard = 0;
  retry = 0;
  timer?: number;
  retryTimer?: number;
  onState = (_s: RoomState) => {};
  onSnapshot = (_s: Snapshot) => {};
  onMessage = (_m: ServerMessage) => {};
  onConnection = (_connected: boolean) => {};
  onError = (_text: string) => {};
  async enter(role?: string, code?: string) {
    const saved = code ? sessionStorage.getItem("rally:" + code) : null;
    const r = await fetch(role ? "/api/rooms" : `/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(role ? { role } : { token: saved }),
    }).catch(() => {
      throw Error(
        "Не удалось связаться с сервером. Проверьте сеть и повторите вход.",
      );
    });
    if (!r.headers.get("Content-Type")?.includes("application/json"))
      throw Error("Сервер временно недоступен. Попробуйте позже.");
    const data = (await r.json()) as {
      code: string;
      token: string;
      id: string;
      error?: string;
    };
    if (!r.ok) throw Error(data.error || "Сервер недоступен");
    this.code = data.code;
    this.token = data.token;
    this.you = data.id;
    sessionStorage.setItem("rally:" + this.code, this.token);
    history.replaceState({}, "", `?room=${this.code}`);
    this.connect();
  }
  connect() {
    this.stopped = false;
    this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${this.code}/ws`,
    );
    this.lastHeard = Date.now();
    this.ws.onopen = () => {
      this.send({ type: "auth", token: this.token });
      this.timer = window.setInterval(() => {
        if (Date.now() - this.lastHeard > 35000) this.ws?.close();
        else this.send({ type: "ping" });
      }, 10000);
    };
    this.ws.onmessage = (e) => {
      this.lastHeard = Date.now();
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === "state") {
        this.state = m.state;
        this.you = m.you;
        this.offset = m.state.serverNow - Date.now();
        this.connected = true;
        this.retry = 0;
        this.onConnection(true);
        this.onState(m.state);
      }
      if (m.type === "snapshot") this.onSnapshot(m.snapshot);
      if (m.type === "pong") this.offset = m.now - Date.now();
      if (m.type === "error") this.onError(m.message);
      this.onMessage(m);
    };
    this.ws.onclose = (e) => {
      clearInterval(this.timer);
      this.connected = false;
      this.onConnection(false);
      if (e.code === 4001 || e.code === 1008 || e.code === 1000) {
        this.stopped = true;
        this.onError(e.reason || "Комната закрыта");
      }
      if (!this.stopped)
        this.retryTimer = window.setTimeout(
          () => this.connect(),
          Math.min(8000, 700 * 2 ** this.retry++),
        );
    };
  }
  send(m: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  leave() {
    this.stopped = true;
    this.send({ type: "leave" });
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
    sessionStorage.removeItem("rally:" + this.code);
    this.ws?.close();
  }
  now() {
    return Date.now() + this.offset;
  }
}
