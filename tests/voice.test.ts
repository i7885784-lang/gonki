import { it, expect, vi } from "vitest";
import { Voice } from "../src/voice";
it("ICE до SDP ожидает remoteDescription; выход останавливает дорожки и соединение", async () => {
  vi.stubGlobal(
    "Audio",
    class {
      autoplay = false;
      srcObject = null;
      setAttribute() {}
      play() {
        return Promise.resolve();
      }
    },
  );
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const added: unknown[] = [];
  let stopped = false,
    closed = false;
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      remoteDescription: any = null;
      localDescription: any = null;
      connectionState = "new";
      addTrack() {}
      close() {
        closed = true;
      }
      async addIceCandidate(c: unknown) {
        expect(this.remoteDescription).not.toBeNull();
        added.push(c);
      }
      async setRemoteDescription(d: unknown) {
        this.remoteDescription = d;
      }
      async createAnswer() {
        return { type: "answer", sdp: "answer" };
      }
      async setLocalDescription(d: unknown) {
        this.localDescription = d;
      }
    },
  );
  const sent: any[] = [];
  const net = {
    send: (m: any) => sent.push(m),
    state: { players: [{ id: "a", role: "codriver" }] },
    you: "a",
  };
  const voice = new Voice(net as any);
  voice.enabled = true;
  voice.stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped = true;
        },
      },
    ],
  } as any;
  await voice.signal({ candidate: { candidate: "candidate-test" } });
  expect(added).toHaveLength(0);
  await voice.signal({ description: { type: "offer", sdp: "offer" } });
  expect(added).toHaveLength(1);
  expect(
    sent.some(
      (m) => m.type === "signal" && m.data.description.type === "answer",
    ),
  ).toBe(true);
  voice.stop();
  expect(stopped).toBe(true);
  expect(closed).toBe(true);
  expect(voice.enabled).toBe(false);
  vi.unstubAllGlobals();
});
