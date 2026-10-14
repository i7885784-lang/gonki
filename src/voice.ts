import type { Network } from "./network";
export class Voice {
  stream?: MediaStream;
  pc?: RTCPeerConnection;
  audio = new Audio();
  context?: AudioContext;
  analyser?: AnalyserNode;
  level = 0;
  muted = false;
  status = "Микрофон выключен";
  peerReady = false;
  enabled = false;
  hasTurn = false;
  queue: RTCIceCandidateInit[] = [];
  config?: RTCConfiguration;
  generation = 0;
  timer?: number;
  onChange = () => {};
  constructor(private net: Network) {
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "");
  }
  setStatus(s: string) {
    this.status = s;
    this.onChange();
  }
  async enable() {
    const generation = ++this.generation;
    this.enabled = false;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Микрофону нужен HTTPS или localhost. Заезд и быстрые команды доступны.",
        );
      this.net.send({ type: "voice-stop" });
      this.closePeer();
      this.stream?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.enabled = true;
      this.muted = false;
      const conf = await this.net.ice();
      if (generation !== this.generation) return;
      this.hasTurn = conf.hasTurn;
      this.config = {
        iceServers: conf.iceServers,
        iceTransportPolicy: conf.iceTransportPolicy,
      };
      this.context ??= new AudioContext();
      await this.context.resume();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      this.setStatus("Микрофон включён · ждём напарника");
      this.net.send({ type: "voice-ready" });
      await this.negotiate();
    } catch (e) {
      if (generation !== this.generation) return;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.enabled = false;
      this.setStatus(
        e instanceof DOMException
          ? e.name === "NotAllowedError"
            ? "Доступ к микрофону запрещён. Разрешите его в настройках браузера."
            : "Микрофон недоступен. Проверьте устройство."
          : (e as Error).message,
      );
    }
  }
  async peer() {
    const wasReady = this.peerReady;
    this.peerReady = true;
    if (this.enabled) {
      if (!wasReady) this.net.send({ type: "voice-ready" });
      await this.negotiate();
    }
  }
  async negotiate() {
    if (!this.enabled || !this.peerReady || this.pc) return;
    const driver =
      this.net.state?.players.find((p) => p.id === this.net.you)?.role ===
      "driver";
    if (driver) {
      const pc = this.makePeer();
      try {
        await pc.setLocalDescription(await pc.createOffer());
        this.net.send({
          type: "signal",
          data: {
            description: {
              type: pc.localDescription!.type as "offer" | "answer",
              sdp: pc.localDescription!.sdp,
            },
          },
        });
      } catch {
        this.setStatus("Голос не подключился. Нажмите «Повторить голос».");
      }
    }
  }
  makePeer() {
    const pc = new RTCPeerConnection(this.config);
    this.pc = pc;
    this.stream!.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => {
      if (e.candidate)
        this.net.send({
          type: "signal",
          data: {
            candidate: {
              ...e.candidate.toJSON(),
              candidate: e.candidate.candidate,
            },
          },
        });
    };
    pc.ontrack = (e) => {
      this.audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      this.audio
        .play()
        .catch(() =>
          this.setStatus("Нажмите «Слышать напарника», чтобы включить звук."),
        );
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearTimeout(this.timer);
        this.setStatus("Голос подключён");
      } else if (["failed", "disconnected"].includes(pc.connectionState))
        this.diagnostic();
    };
    this.setStatus("Соединяем голос…");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (pc.connectionState !== "connected") this.diagnostic();
    }, 15000);
    return pc;
  }
  diagnostic() {
    this.setStatus(
      this.hasTurn
        ? "Голос потерял связь. Проверьте сеть и повторите подключение."
        : "Голос не соединился. Без TURN некоторые сети несовместимы. Используйте быстрые команды.",
    );
  }
  async signal(data: any) {
    if (!this.enabled) return;
    try {
      if (data.description) {
        if (data.description.type === "offer") {
          const pending = this.pc ? [] : this.queue;
          this.closePeer();
          this.makePeer();
          this.queue = pending;
        }
        const pc = this.pc;
        if (!pc) return;
        await pc.setRemoteDescription(data.description);
        for (const c of this.queue) await pc.addIceCandidate(c);
        this.queue = [];
        if (data.description.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          this.net.send({
            type: "signal",
            data: {
              description: {
                type: pc.localDescription!.type as "offer" | "answer",
                sdp: pc.localDescription!.sdp,
              },
            },
          });
        }
      } else if (data.candidate) {
        if (this.pc?.remoteDescription)
          await this.pc.addIceCandidate(data.candidate);
        else this.queue.push(data.candidate);
      }
    } catch {
      this.diagnostic();
    }
  }
  mute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this.onChange();
  }
  meter() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return Math.min(
      1,
      Math.sqrt(
        data.reduce((s, x) => s + ((x - 128) / 128) ** 2, 0) / data.length,
      ) * 5,
    );
  }
  closePeer() {
    clearTimeout(this.timer);
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = undefined;
    }
    this.audio.srcObject = null;
    this.queue = [];
  }
  disconnected() {
    this.peerReady = false;
    this.closePeer();
    if (this.enabled) this.setStatus("Голос ждёт восстановления связи");
  }
  stop() {
    this.generation++;
    this.net.send({ type: "voice-stop" });
    this.closePeer();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.context = undefined;
    this.enabled = false;
    this.peerReady = false;
    this.setStatus("Микрофон выключен");
  }
}
