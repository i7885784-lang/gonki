import RAPIER from "@dimforge/rapier3d-compat";
import { at, project, roadStrip, route, type Vec3 } from "../shared/track";
export type Input = {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
};
export class CarPhysics {
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  vehicle: RAPIER.DynamicRayCastVehicleController;
  progress = 0;
  speed = 0;
  steering = 0;
  reverseHeld = 0;
  offroad = false;
  static async create() {
    await RAPIER.init();
    return new CarPhysics();
  }
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    for (const [width, drop, friction] of [
      [6, 0, 0.9],
      [24, 0.035, 0.55],
    ]) {
      const strip = roadStrip(width, drop);
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(strip.vertices, strip.indices).setFriction(
          friction,
        ),
      );
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -12, 1000),
    );
    for (let i = 0; i < route.length - 1; i += 3) {
      const p = route[i],
        b = route[Math.min(i + 3, route.length - 1)];
      if (p.y < 65) continue;
      const yaw = Math.atan2(b.x - p.x, b.z - p.z),
        len = Math.hypot(b.x - p.x, b.z - p.z);
      for (const side of [-1, 1])
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.22, 0.6, len / 2 + 0.2)
            .setTranslation(
              (p.x + b.x) / 2 + Math.cos(yaw) * 8 * side,
              (p.y + b.y) / 2 + 0.6,
              (p.z + b.z) / 2 - Math.sin(yaw) * 8 * side,
            )
            .setRotation({
              x: 0,
              y: Math.sin(yaw / 2),
              z: 0,
              w: Math.cos(yaw / 2),
            }),
        );
    }
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.85, 0)
        .setLinearDamping(0.04)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.82, 0.28, 1.8)
        .setTranslation(0, 0.25, 0)
        .setMass(1050)
        .setFriction(0.5),
      this.body,
    );
    this.vehicle = this.world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    for (const z of [1.3, -1.3])
      for (const x of [-0.86, 0.86]) {
        this.vehicle.addWheel(
          { x, y: 0.05, z },
          { x: 0, y: -1, z: 0 },
          { x: -1, y: 0, z: 0 },
          0.4,
          0.36,
        );
        const i = this.vehicle.numWheels() - 1;
        this.vehicle.setWheelSuspensionStiffness(i, 32);
        this.vehicle.setWheelSuspensionCompression(i, 4.4);
        this.vehicle.setWheelSuspensionRelaxation(i, 5);
        this.vehicle.setWheelMaxSuspensionTravel(i, 0.22);
        this.vehicle.setWheelMaxSuspensionForce(i, 12000);
        this.vehicle.setWheelFrictionSlip(i, 2.1);
        this.vehicle.setWheelSideFrictionStiffness(i, 1.2);
      }
    this.world.step();
  }
  reset(
    progress: number,
    pos?: Vec3,
    q?: { x: number; y: number; z: number; w: number },
  ) {
    const p = at(progress);
    this.progress = progress;
    this.body.setTranslation(pos ?? { x: p.x, y: p.y + 0.85, z: p.z }, true);
    this.body.setRotation(
      q ?? { x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) },
      true,
    );
    this.freeze();
    this.world.step();
  }
  freeze() {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.reverseHeld = 0;
  }
  step(input: Input) {
    const velocity = this.body.linvel(),
      q = this.body.rotation();
    const forward = {
      x: 2 * (q.x * q.z + q.w * q.y),
      y: 2 * (q.y * q.z - q.w * q.x),
      z: 1 - 2 * (q.x * q.x + q.y * q.y),
    };
    this.speed =
      velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
    const pos = project(this.body.translation(), this.progress);
    this.progress = pos.s;
    this.offroad = pos.distance > 6;
    this.reverseHeld =
      input.brake > 0.1 && Math.abs(this.speed) < 1
        ? this.reverseHeld + 1 / 60
        : Math.abs(this.speed) > 1 && this.speed > 0
          ? 0
          : this.reverseHeld;
    const reverse =
      input.brake > 0.1 && this.reverseHeld > 0.65 && this.speed < 1;
    const target = input.steer * (0.48 / (1 + Math.abs(this.speed) * 0.055));
    this.steering += (target - this.steering) * 0.17;
    const engine = reverse
      ? -1800 * input.brake * Math.max(0, 1 + this.speed / 7)
      : 2300 * input.throttle * Math.max(0.12, 1 - Math.abs(this.speed) / 48);
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      this.vehicle.setWheelSteering(i, rear ? 0 : this.steering);
      this.vehicle.setWheelEngineForce(i, engine);
      this.vehicle.setWheelBrake(
        i,
        (input.handbrake && rear ? 120 : !reverse ? input.brake * 85 : 0) +
          (input.throttle < 0.1 && input.brake < 0.1 ? 1.4 : 0),
      );
      this.vehicle.setWheelFrictionSlip(
        i,
        (this.offroad ? 1.15 : 2.1) * (rear && input.handbrake ? 0.38 : 1),
      );
      this.vehicle.setWheelSideFrictionStiffness(i, rear ? 1.05 : 1.2);
    }
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const drag = (0.5 * speed + 12) / 60;
    this.body.applyImpulse(
      { x: -velocity.x * drag, y: 0, z: -velocity.z * drag },
      true,
    );
    this.vehicle.updateVehicle(1 / 60, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    this.world.step();
  }
  dispose() {
    this.world.free();
  }
}
