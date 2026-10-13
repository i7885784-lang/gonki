import * as THREE from "three";
import { CarPhysics, type Input } from "./physics";
import { roadStrip, route, at, LENGTH } from "../shared/track";
export class Game {
  physics!: CarPhysics;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 1, 0.1, 650);
  car = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  keys = new Set<string>();
  touch: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  input: Input = { ...this.touch };
  chase = true;
  reduced = true;
  quality = "medium";
  accumulator = 0;
  active = false;
  lastSpeed = 0;
  onCollision = () => {};
  onReset = () => {};
  onPause = () => {};
  cameraReady = false;
  padCamera = false;
  static async create(canvas: HTMLCanvasElement) {
    const g = new Game(canvas);
    g.physics = await CarPhysics.create();
    g.build();
    return g;
  }
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#adc2b7");
    this.scene.fog = new THREE.Fog("#adc2b7", 110, 550);
    this.scene.add(new THREE.HemisphereLight("#fff5d9", "#476441", 2.6));
    const light = new THREE.DirectionalLight("#ffecd1", 2.3);
    light.position.set(-50, 100, 40);
    this.scene.add(light);
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
  }
  down = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).matches("input,select,textarea") ||
      !this.canvas.offsetParent
    )
      return;
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    if (!e.repeat) {
      if (e.code === "KeyC") this.chase = !this.chase;
      if (e.code === "KeyR") this.onReset();
      if (e.code === "Escape") this.onPause();
    }
    this.keys.add(e.code);
  };
  up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  blur = () => {
    this.clear();
  };
  clear() {
    this.keys.clear();
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.input = { ...this.touch };
  }
  build() {
    for (const [width, drop, color] of [
      [24, 0.04, "#738967"],
      [6, 0, "#baa88b"],
    ] as const) {
      const strip = roadStrip(width, drop);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(strip.vertices, 3),
      );
      geo.setIndex(new THREE.BufferAttribute(strip.indices, 1));
      geo.computeVertexNormals();
      this.scene.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            side: THREE.DoubleSide,
          }),
        ),
      );
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: "#778b6c" }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -11, 1000);
    this.scene.add(ground);
    const box = (
      w: number,
      h: number,
      d: number,
      color: string,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.scene,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
      );
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    box(1.8, 0.55, 3.7, "#e76b3e", 0, 0.37, 0, this.car);
    box(1.6, 0.55, 1.7, "#263e3a", 0, 0.91, -0.18, this.car);
    box(1.65, 0.12, 1.75, "#edebe0", 0, 1.23, -0.18, this.car);
    box(0.3, 0.57, 3.72, "#f3ead5", 0, 0.4, 0, this.car);
    for (const x of [-0.63, 0.63])
      box(0.38, 0.15, 0.08, "#fff2b7", x, 0.43, 1.87, this.car);
    box(1.9, 0.12, 0.4, "#24362f", 0, 0.85, -1.65, this.car);
    for (const z of [1.3, -1.3])
      for (const x of [-0.91, 0.91]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12),
          new THREE.MeshStandardMaterial({ color: "#242a27" }),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -0.1, z);
        this.car.add(wheel);
        this.wheels.push(wheel);
      }
    this.scene.add(this.car);
    const treeGeo = new THREE.ConeGeometry(3, 11, 7),
      treeMat = new THREE.MeshStandardMaterial({ color: "#345748" });
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < route.length; i += 7) {
      const p = at(route[i].s);
      for (const side of [-1, 1]) {
        const offset = 15 + ((i * 17) % 28);
        const x = p.x + Math.cos(p.yaw) * offset * side,
          z = p.z - Math.sin(p.yaw) * offset * side;
        if (route.some((q) => Math.hypot(q.x - x, q.z - z) < 10)) continue;
        positions.push(new THREE.Vector3(x, p.y + 4, z));
      }
    }
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, positions.length),
      dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.scale.setScalar(0.65 + (i % 7) / 12);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trees);
    for (let i = 0; i < route.length - 3; i += 3) {
      const p = at(route[i].s),
        b = route[i + 3];
      if (p.y > 65)
        for (const side of [-1, 1]) {
          const bar = box(
            0.44,
            1.2,
            Math.hypot(b.x - p.x, b.z - p.z) + 0.4,
            "#c3c4af",
            (p.x + b.x) / 2 + Math.cos(p.yaw) * 8 * side,
            (p.y + b.y) / 2 + 0.6,
            (p.z + b.z) / 2 - Math.sin(p.yaw) * 8 * side,
          );
          bar.rotation.y = Math.atan2(b.x - p.x, b.z - p.z);
        }
      if (i % 12 === 0)
        for (const side of [-1, 1]) {
          box(
            0.18,
            1,
            0.18,
            "#eee9d5",
            p.x + Math.cos(p.yaw) * 6.5 * side,
            p.y + 0.5,
            p.z - Math.sin(p.yaw) * 6.5 * side,
          );
        }
    }
    for (let i = 0; i < 25; i++) {
      const p = at(((i + 0.5) * LENGTH) / 25);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(2 + (i % 4), 0),
        new THREE.MeshStandardMaterial({ color: "#8f9485" }),
      );
      rock.position.set(
        p.x + 45 * Math.cos(p.yaw) * (i % 2 ? 1 : -1),
        p.y + 1,
        p.z - 45 * Math.sin(p.yaw) * (i % 2 ? 1 : -1),
      );
      this.scene.add(rock);
    }
    for (const s of [0, LENGTH - 12]) {
      const p = at(s),
        gate = new THREE.Group();
      gate.position.set(p.x, p.y, p.z);
      gate.rotation.y = p.yaw;
      for (const side of [-1, 1])
        box(0.35, 5, 0.35, "#e7e6d5", side * 6.5, 2.5, 0, gate);
      box(13.5, 1, 0.25, "#233e34", 0, 4.8, 0, gate);
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#233e34";
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = "#fff4d8";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s === 0 ? "СТАРТ" : "ФИНИШ", 256, 47);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 0.9),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(c),
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 4.8, -0.14);
      sign.rotation.y = Math.PI;
      gate.add(sign);
      this.scene.add(gate);
    }
  }
  setActive(value: boolean) {
    if (this.active && !value) {
      this.physics.freeze();
      this.clear();
    }
    this.active = value;
  }
  frame(dt: number) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    const k = this.keys,
      pressed = (...keys: string[]) => keys.some((key) => k.has(key));
    const pad = navigator.getGamepads?.()[0];
    this.input = {
      throttle: Math.max(
        this.touch.throttle,
        pressed("KeyW", "ArrowUp") ? 1 : 0,
        pad?.buttons[7]?.value ?? 0,
      ),
      brake: Math.max(
        this.touch.brake,
        pressed("KeyS", "ArrowDown") ? 1 : 0,
        pad?.buttons[6]?.value ?? 0,
      ),
      steer:
        this.touch.steer +
        (pressed("KeyD", "ArrowRight") ? 1 : 0) -
        (pressed("KeyA", "ArrowLeft") ? 1 : 0),
      handbrake:
        this.touch.handbrake || pressed("Space") || !!pad?.buttons[0]?.pressed,
    };
    if (pad && Math.abs(pad.axes[0]) > 0.12) this.input.steer = pad.axes[0];
    this.input.steer = Math.max(-1, Math.min(1, this.input.steer));
    if (pad?.buttons[3]?.pressed && !this.padCamera) this.chase = !this.chase;
    this.padCamera = !!pad?.buttons[3]?.pressed;
    if (this.active) {
      this.accumulator += Math.min(dt, 0.1);
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 6) {
        this.physics.step(this.input);
        this.accumulator -= 1 / 60;
      }
    } else {
      this.accumulator = 0;
      this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    }
    const p = this.physics.body.translation(),
      q = this.physics.body.rotation();
    this.car.position.set(p.x, p.y, p.z);
    this.car.quaternion.set(q.x, q.y, q.z, q.w);
    for (let i = 0; i < 4; i++) {
      this.wheels[i].position.y =
        0.05 - (this.physics.vehicle.wheelSuspensionLength(i) ?? 0.4);
      this.wheels[i].rotation.set(
        this.physics.vehicle.wheelRotation(i) ?? 0,
        i < 2 ? this.physics.steering : 0,
        Math.PI / 2,
      );
    }
    const target = new THREE.Vector3(
      this.chase ? 0 : 0,
      this.chase ? 4 : 1.35,
      this.chase ? -9 : 1.15,
    )
      .applyQuaternion(this.car.quaternion)
      .add(this.car.position);
    if (!this.cameraReady) {
      this.camera.position.copy(target);
      this.cameraReady = true;
    } else
      this.camera.position.lerp(target, this.chase ? 1 - Math.exp(-dt * 9) : 1);
    const look = new THREE.Vector3(0, this.chase ? 0.6 : 1.2, 14)
      .applyQuaternion(this.car.quaternion)
      .add(this.car.position);
    if (!this.reduced && this.active)
      look.y +=
        Math.sin(performance.now() * 0.032) *
        Math.abs(this.physics.speed) *
        0.0015;
    this.camera.lookAt(look);
    this.renderer.render(this.scene, this.camera);
    if (this.lastSpeed - Math.abs(this.physics.speed) > 4 && this.active)
      this.onCollision();
    this.lastSpeed = Math.abs(this.physics.speed);
  }
  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
    this.physics.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        for (const mat of Array.isArray(m.material)
          ? m.material
          : [m.material]) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
