import { WORLD_HEIGHT, WORLD_WIDTH } from "./courseGenerator.js";

const TREE_COLLISION_PADDING = 3;
const BASKET_CATCH_RADIUS = 14;

export function planFlight({ start, aim, power, accuracy, disc, hole }) {
  const direction = normalize({
    x: aim.x - start.x,
    y: aim.y - start.y,
  });
  const safeDirection = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;
  const side = { x: -safeDirection.y, y: safeDirection.x };
  const angleError = accuracy.magnitude > disc.accuracyTolerance
    ? (accuracy.magnitude - disc.accuracyTolerance) * accuracy.sign * disc.maxTurn
    : 0;
  const travelDirection = rotate(safeDirection, angleError);
  const distanceScale = clamp(0.22 + power * 0.9, 0.2, 1.12);
  const accuracyScale = clamp(1 - accuracy.magnitude * 0.22, 0.68, 1);
  const travelDistance = disc.maxDistance * distanceScale * accuracyScale;
  const flightCurve = (disc.curveStrength + accuracy.sign * accuracy.magnitude * 0.3) * travelDistance * 0.34;
  const control = {
    x: start.x + travelDirection.x * travelDistance * 0.55 + side.x * flightCurve,
    y: start.y + travelDirection.y * travelDistance * 0.55 + side.y * flightCurve,
  };
  const intendedEnd = clampPoint({
    x: start.x + travelDirection.x * travelDistance,
    y: start.y + travelDirection.y * travelDistance,
  });
  const path = buildPath(start, control, intendedEnd, 46);
  const treeCollision = findTreeCollision(path, hole.trees);
  const magnetActive = isBestDiscForDistance(disc, distanceBetween(start, hole.basket));
  const basketCrossing = magnetActive
    ? findBasketCrossing(path, hole.basket, BASKET_CATCH_RADIUS)
    : null;

  if (basketCrossing && (!treeCollision || basketCrossing.index < treeCollision.index)) {
    const madePath = path.slice(0, basketCrossing.index);
    madePath.push(hole.basket);

    return {
      path: madePath,
      displayPoint: hole.basket,
      resolvedLie: hole.basket,
      penalties: 0,
      event: "chains",
      holedOut: true,
      distance: travelDistance,
      control,
      end: hole.basket,
    };
  }

  if (treeCollision) {
    const drop = clampPoint({
      x: treeCollision.point.x - safeDirection.x * 6,
      y: treeCollision.point.y - safeDirection.y * 6,
    });

    return {
      path: path.slice(0, treeCollision.index + 1),
      displayPoint: treeCollision.point,
      resolvedLie: drop,
      penalties: 1,
      event: "tree",
      holedOut: false,
      distance: travelDistance,
      control,
      end: treeCollision.point,
    };
  }

  const water = hole.waters.find((hazard) => pointInsideEllipse(intendedEnd, hazard));
  if (water) {
    const safeDrop = findSafeDrop(intendedEnd, water, hole);

    return {
      path,
      displayPoint: intendedEnd,
      resolvedLie: safeDrop,
      penalties: 1,
      event: "water",
      holedOut: false,
      distance: travelDistance,
      control,
      end: intendedEnd,
    };
  }

  return {
    path,
    displayPoint: intendedEnd,
    resolvedLie: intendedEnd,
    penalties: 0,
    event: "land",
    holedOut: false,
    distance: travelDistance,
    control,
    end: intendedEnd,
  };
}

export function buildPath(start, control, end, steps = 40) {
  const samples = [];

  for (let index = 0; index <= steps; index += 1) {
    samples.push(sampleQuadratic(start, control, end, index / steps));
  }

  return samples;
}

export function sampleQuadratic(start, control, end, t) {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
  };
}

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatRelativeScore(value) {
  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${value}` : `${value}`;
}

function rotate(vector, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return normalize({
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  });
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function clampPoint(point) {
  return {
    x: clamp(point.x, 10, WORLD_WIDTH - 10),
    y: clamp(point.y, 10, WORLD_HEIGHT - 10),
  };
}

function pointInsideEllipse(point, ellipse) {
  const dx = (point.x - ellipse.x) / ellipse.rx;
  const dy = (point.y - ellipse.y) / ellipse.ry;
  return dx * dx + dy * dy <= 1;
}

function findTreeCollision(path, trees) {
  for (let pathIndex = 1; pathIndex < path.length; pathIndex += 1) {
    const point = path[pathIndex];
    const tree = trees.find((candidate) => distanceBetween(point, candidate) <= candidate.radius + TREE_COLLISION_PADDING);

    if (tree) {
      return {
        index: pathIndex,
        tree,
        point,
      };
    }
  }

  return null;
}

function findBasketCrossing(path, basket, radius) {
  for (let pathIndex = 1; pathIndex < path.length; pathIndex += 1) {
    const previousPoint = path[pathIndex - 1];
    const point = path[pathIndex];
    const closestPoint = closestPointOnSegment(previousPoint, point, basket);

    if (distanceBetween(closestPoint, basket) <= radius) {
      return {
        index: pathIndex,
        point: closestPoint,
      };
    }
  }

  return null;
}

function findSafeDrop(point, water, hole) {
  const direction = normalize({
    x: point.x - water.x,
    y: point.y - water.y,
  });
  const outward = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;

  for (let step = 0; step < 18; step += 1) {
    const candidate = clampPoint({
      x: water.x + outward.x * (water.rx + 8 + step * 5),
      y: water.y + outward.y * (water.ry + 8 + step * 5),
    });

    const blockedByWater = hole.waters.some((hazard) => pointInsideEllipse(candidate, hazard));
    const blockedByTree = hole.trees.some((tree) => distanceBetween(candidate, tree) <= tree.radius + 4);

    if (!blockedByWater && !blockedByTree) {
      return candidate;
    }
  }

  return clampPoint({
    x: water.x + water.rx + 14,
    y: water.y,
  });
}

const DISC_DISTANCE_THRESHOLDS = [
  { id: "putter", maxReach: 72 },
  { id: "mid", maxReach: 92 },
  { id: "fairway", maxReach: 115 },
  { id: "driver", maxReach: 130 },
];

function isBestDiscForDistance(disc, distance) {
  const best = DISC_DISTANCE_THRESHOLDS.find((d) => distance <= d.maxReach);
  return best ? disc.id === best.id : disc.id === "driver";
}

function closestPointOnSegment(start, end, point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return start;
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / segmentLengthSquared;
  const clampedProjection = clamp(projection, 0, 1);

  return {
    x: start.x + dx * clampedProjection,
    y: start.y + dy * clampedProjection,
  };
}
