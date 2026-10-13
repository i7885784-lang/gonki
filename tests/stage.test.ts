import { expect, it } from "vitest";
import { CarPhysics } from "../src/physics";
import { at, LENGTH, project } from "../shared/track";
it("полный физический проезд трассы с тестовым регулятором руля и педалей", async () => {
  const car = await CarPhysics.create();
  let finishedAt = 0,
    maxOff = 0;
  for (let frame = 0; frame < 60 * 360; frame++) {
    const pos = car.body.translation(),
      q = car.body.rotation();
    const yaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.x * q.x),
    );
    const path = project(pos, car.progress);
    const target = at(car.progress + Math.max(10, Math.abs(car.speed) * 0.9));
    let diff = Math.atan2(target.x - pos.x, target.z - pos.z) - yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const far = at(car.progress + 45),
      curve = Math.abs(
        Math.atan2(Math.sin(far.yaw - path.yaw), Math.cos(far.yaw - path.yaw)),
      );
    const desired = Math.max(6, 20 - curve * 14);
    car.step({
      throttle: car.speed < desired ? 1 : 0,
      brake: car.speed > desired + 2 ? 0.4 : 0,
      steer: Math.max(-1, Math.min(1, diff * 2.8)),
      handbrake: false,
    });
    maxOff = Math.max(maxOff, path.distance);
    if (path.distance > 15 || pos.y < path.y - 3)
      throw Error(`Машина покинула поверхность на ${car.progress} м`);
    if (car.progress > LENGTH - 15) {
      finishedAt = frame / 60;
      break;
    }
  }
  car.dispose();
  expect(finishedAt).toBeGreaterThan(180);
  expect(finishedAt).toBeLessThan(300);
  expect(maxOff).toBeLessThan(6);
}, 20000);
