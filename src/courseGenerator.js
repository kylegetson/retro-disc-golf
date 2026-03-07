export const WORLD_WIDTH = 400;
export const WORLD_HEIGHT = 300;

const HOLE_LENGTHS = {
  3: [150, 205],
  4: [205, 265],
  5: [255, 320],
};

export function generateCourse(holeCount = 3, seed = Date.now()) {
  const random = createRng(seed);
  const holes = [];

  for (let index = 0; index < holeCount; index += 1) {
    holes.push(generateHole(index, random));
  }

  return holes;
}

function generateHole(index, random) {
  const par = randomInt(random, 3, 5);
  const [minLength, maxLength] = HOLE_LENGTHS[par];
  const teeBasket = pickTeeAndBasket(random, minLength, maxLength);
  const fairwayWidth = randomInt(random, 24, 36);
  const fairwayControl = buildFairwayControl(teeBasket.tee, teeBasket.basket, random);
  const waters = generateWaterHazards(random, teeBasket.tee, teeBasket.basket, fairwayControl, fairwayWidth);
  const trees = generateTrees(random, teeBasket.tee, teeBasket.basket, fairwayControl, fairwayWidth, waters);

  return {
    index,
    par,
    tee: teeBasket.tee,
    basket: teeBasket.basket,
    fairwayWidth,
    fairwayControl,
    trees,
    waters,
    paletteShift: randomInt(random, 0, 3),
  };
}

function pickTeeAndBasket(random, minLength, maxLength) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const tee = {
      x: randomInt(random, 28, WORLD_WIDTH - 28),
      y: randomInt(random, 28, WORLD_HEIGHT - 28),
    };
    const basket = {
      x: randomInt(random, 28, WORLD_WIDTH - 28),
      y: randomInt(random, 28, WORLD_HEIGHT - 28),
    };
    const holeLength = distance(tee, basket);

    if (holeLength >= minLength && holeLength <= maxLength) {
      return { tee, basket };
    }
  }

  return {
    tee: { x: 40, y: 150 },
    basket: { x: 350, y: 150 },
  };
}

function buildFairwayControl(tee, basket, random) {
  const mid = midpoint(tee, basket);
  const dir = normalize({
    x: basket.x - tee.x,
    y: basket.y - tee.y,
  });
  const side = { x: -dir.y, y: dir.x };
  const offset = randomInt(random, -52, 52);

  return {
    x: clamp(mid.x + side.x * offset, 36, WORLD_WIDTH - 36),
    y: clamp(mid.y + side.y * offset, 36, WORLD_HEIGHT - 36),
  };
}

function generateWaterHazards(random, tee, basket, fairwayControl, fairwayWidth) {
  const hazardCount = randomInt(random, 0, 2);
  const waters = [];

  for (let index = 0; index < hazardCount; index += 1) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const t = randomRange(random, 0.18, 0.82);
      const fairwayPoint = sampleQuadratic(tee, fairwayControl, basket, t);
      const tangent = quadraticTangent(tee, fairwayControl, basket, t);
      const side = normalize({ x: -tangent.y, y: tangent.x });
      const offset = randomRange(random, fairwayWidth * 0.3, fairwayWidth * 1.1) * (random() > 0.5 ? 1 : -1);
      const candidate = {
        x: fairwayPoint.x + side.x * offset,
        y: fairwayPoint.y + side.y * offset,
        rx: randomInt(random, 16, 28),
        ry: randomInt(random, 10, 22),
      };

      if (!insideBounds(candidate)) {
        continue;
      }

      if (distance(candidate, tee) < 34 || distance(candidate, basket) < 34) {
        continue;
      }

      if (waters.some((water) => distance(candidate, water) < Math.max(candidate.rx, candidate.ry) + Math.max(water.rx, water.ry) + 16)) {
        continue;
      }

      waters.push(candidate);
      break;
    }
  }

  return waters;
}

function generateTrees(random, tee, basket, fairwayControl, fairwayWidth, waters) {
  const treeCount = randomInt(random, 5, 15);
  const trees = [];

  for (let index = 0; index < treeCount; index += 1) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const tree = {
        x: randomInt(random, 18, WORLD_WIDTH - 18),
        y: randomInt(random, 18, WORLD_HEIGHT - 18),
        radius: randomInt(random, 5, 7),
      };

      if (distance(tree, tee) < 18 || distance(tree, basket) < 18) {
        continue;
      }

      if (waters.some((water) => pointInsideEllipse(tree, water))) {
        continue;
      }

      const distanceToFairway = distanceToQuadratic(tee, fairwayControl, basket, tree);
      const laneAllowance = index % 4 === 0 ? fairwayWidth * 0.35 : fairwayWidth * 0.55;

      if (distanceToFairway < laneAllowance) {
        continue;
      }

      if (trees.some((other) => distance(tree, other) < tree.radius + other.radius + 8)) {
        continue;
      }

      trees.push(tree);
      break;
    }
  }

  return trees;
}

function distanceToQuadratic(p0, p1, p2, point) {
  let minDistance = Infinity;

  for (let step = 0; step <= 32; step += 1) {
    const sample = sampleQuadratic(p0, p1, p2, step / 32);
    minDistance = Math.min(minDistance, distance(sample, point));
  }

  return minDistance;
}

function sampleQuadratic(p0, p1, p2, t) {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
  };
}

function quadraticTangent(p0, p1, p2, t) {
  return {
    x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

function createRng(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInsideEllipse(point, ellipse) {
  const dx = (point.x - ellipse.x) / ellipse.rx;
  const dy = (point.y - ellipse.y) / ellipse.ry;
  return dx * dx + dy * dy <= 1;
}

function randomInt(random, min, max) {
  return Math.floor(randomRange(random, min, max + 1));
}

function randomRange(random, min, max) {
  return min + random() * (max - min);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function insideBounds(ellipse) {
  return (
    ellipse.x - ellipse.rx > 12 &&
    ellipse.x + ellipse.rx < WORLD_WIDTH - 12 &&
    ellipse.y - ellipse.ry > 12 &&
    ellipse.y + ellipse.ry < WORLD_HEIGHT - 12
  );
}
