export class ThrowSystem {
  constructor() {
    this.targetPower = 0.5;
    this.targetWindow = 0.2;
    this.reset();
  }

  reset() {
    this.phase = "idle";
    this.powerNeedle = 0;
    this.powerDirection = 1;
    this.lockedPower = 0;
  }

  update(deltaSeconds) {
    if (this.phase === "power") {
      this.powerNeedle += this.powerDirection * deltaSeconds * 0.95;
      if (this.powerNeedle >= 1) {
        this.powerNeedle = 1;
        this.powerDirection = -1;
      } else if (this.powerNeedle <= 0) {
        this.powerNeedle = 0;
        this.powerDirection = 1;
      }
    }
  }

  click() {
    if (this.phase === "idle") {
      this.phase = "power";
      this.powerNeedle = 0;
      this.powerDirection = 1;
      return { type: "start-power" };
    }

    if (this.phase === "power") {
      this.lockedPower = this.powerNeedle;
      this.phase = "resolved";
      const miss = this.lockedPower - this.targetPower;
      const normalizedMiss = clamp(miss / this.targetWindow, -1.6, 1.6);
      const magnitude = Math.min(Math.abs(miss), 1);
      const rating = Math.abs(normalizedMiss) < 0.22 ? "perfect" : Math.abs(normalizedMiss) < 0.7 ? "solid" : "wild";
      return {
        type: "throw",
        power: this.lockedPower,
        accuracy: {
          raw: miss,
          magnitude,
          sign: normalizedMiss === 0 ? 0 : normalizedMiss > 0 ? 1 : -1,
          rating,
        },
        targetPower: this.targetPower,
      };
    }

    return null;
  }

  setTargetPower(targetPower) {
    this.targetPower = clamp(targetPower, 0.12, 0.88);
  }

  getMeterState() {
    if (this.phase === "power") {
      return {
        visible: true,
        needlePosition: this.powerNeedle,
        sweetSpotCenter: this.targetPower,
        sweetSpotWidth: this.targetWindow,
        label: "Click again to throw",
        hint: "Stop inside the target band for a clean release. Outside it adds drift and steals distance.",
      };
    }

    return {
      visible: true,
      needlePosition: 0,
      sweetSpotCenter: this.targetPower,
      sweetSpotWidth: this.targetWindow,
      label: "Click to start power",
      hint: "1st click starts power. 2nd click stops inside the target band to throw clean.",
    };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
