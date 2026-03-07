import { generateCourse, WORLD_HEIGHT, WORLD_WIDTH } from "./courseGenerator.js";
import { buildPath, clamp, distanceBetween, formatRelativeScore, planFlight } from "./discPhysics.js";
import { BackgroundMusic, RetroSound } from "./sound.js";
import { ThrowSystem } from "./throwSystem.js";
import { UI } from "./ui.js";

const STORAGE_KEY = "retro-disc-golf-save";
const FEET_PER_UNIT = 2;
const HOLE_TRANSITION_MS = 1800;
const TRACK_MANIFEST_PATH = "./tracks/manifest.json";

const DISCS = [
  {
    id: "driver",
    shortLabel: "Driver",
    label: "Distance Driver",
    note: "Longest with heavy fade",
    maxDistance: 130,
    curveStrength: 0.42,
    accuracyTolerance: 0.18,
    maxTurn: Math.PI / 6.2,
    color: "#ff8b3d",
  },
  {
    id: "fairway",
    shortLabel: "Fairway",
    label: "Fairway Driver",
    note: "Long but easier to control",
    maxDistance: 115,
    curveStrength: 0.26,
    accuracyTolerance: 0.24,
    maxTurn: Math.PI / 7.2,
    color: "#ffd255",
  },
  {
    id: "mid",
    shortLabel: "Mid",
    label: "Midrange",
    note: "Straight approach lines",
    maxDistance: 92,
    curveStrength: 0.1,
    accuracyTolerance: 0.3,
    maxTurn: Math.PI / 9,
    color: "#7ee081",
  },
  {
    id: "putter",
    shortLabel: "Putter",
    label: "Putter",
    note: "No fade inside the circle",
    maxDistance: 72,
    curveStrength: 0,
    accuracyTolerance: 0.34,
    maxTurn: Math.PI / 10,
    color: "#90ecff",
  },
];

class RetroDiscGolfGame {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.displayContext = this.canvas.getContext("2d");
    this.worldCanvas = document.createElement("canvas");
    this.worldCanvas.width = WORLD_WIDTH;
    this.worldCanvas.height = WORLD_HEIGHT;
    this.worldContext = this.worldCanvas.getContext("2d");
    this.throwSystem = new ThrowSystem();
    this.sound = new RetroSound();
    this.music = new BackgroundMusic();
    this.tracks = [];
    this.selectedTrackId = "";
    this.ui = new UI({
      discs: DISCS,
      onDiscSelect: (discId) => this.selectDisc(discId),
      onPlayAgain: () => this.startRound(),
      onToggleMusic: () => this.toggleMusic(),
      onTrackSelect: (trackId) => this.selectTrack(trackId),
    });

    this.displayContext.imageSmoothingEnabled = false;
    this.worldContext.imageSmoothingEnabled = false;
    this.save = this.loadSave();
    this.lastTimestamp = performance.now();
    this.mouseWorld = { x: 200, y: 150 };
    this.animation = null;
    this.ui.updateMusicToggle(this.save.musicEnabled);

    this.bindEvents();
    this.loadTracks();
    this.startRound();
    requestAnimationFrame((timestamp) => this.frame(timestamp));
  }

  bindEvents() {
    this.canvas.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const normalizedX = (event.clientX - rect.left) / rect.width;
      const normalizedY = (event.clientY - rect.top) / rect.height;
      this.mouseWorld = {
        x: clamp(normalizedX * WORLD_WIDTH, 0, WORLD_WIDTH),
        y: clamp(normalizedY * WORLD_HEIGHT, 0, WORLD_HEIGHT),
      };
    });

    this.canvas.addEventListener("click", () => this.handleCanvasClick());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        this.handleCanvasClick();
      }
    });

    window.addEventListener("pointerdown", () => {
      if (this.save.musicEnabled && this.selectedTrackId) {
        this.music.play();
      }
    });
  }

  startRound() {
    this.holes = generateCourse(3, Date.now());
    this.holeResults = this.holes.map((hole) => ({ par: hole.par, strokes: 0 }));
    this.currentHoleIndex = 0;
    this.selectedDiscId = "driver";
    this.roundComplete = false;
    this.transitionAt = 0;
    this.animation = null;
    this.throwSystem.reset();
    this.ui.hideScoreboard();
    this.startHole();
  }

  startHole() {
    this.currentHole = this.holes[this.currentHoleIndex];
    this.lie = { ...this.currentHole.tee };
    this.discSprite = { ...this.lie };
    this.throwSystem.reset();
    this.animation = null;
    this.transitionAt = 0;
    this.ui.showMessage(
      `Hole ${this.currentHoleIndex + 1} · Par ${this.currentHole.par}`,
      "Aim with the mouse. Click once to start power, then click again inside the target band to throw."
    );
    this.syncTargetPower();
    this.refreshHud("Line up the tee shot.");
    this.ui.updateDiscSelection(this.getSelectedDisc());
  }

  selectDisc(discId) {
    if (this.roundComplete || this.animation || this.throwSystem.phase !== "idle") {
      return;
    }

    this.sound.unlock();
    this.sound.click();
    this.selectedDiscId = discId;
    this.syncTargetPower();
    this.ui.updateDiscSelection(this.getSelectedDisc());
    this.refreshHud(`${this.getSelectedDisc().label} selected.`);
  }

  handleCanvasClick() {
    if (this.roundComplete || this.animation || this.transitionAt) {
      return;
    }

    this.sound.unlock();
    if (this.save.musicEnabled && this.selectedTrackId) {
      this.music.play();
    }
    this.ui.hideMessage();

    const result = this.throwSystem.click();
    if (!result) {
      return;
    }

    if (result.type === "start-power") {
      this.sound.beep();
      this.refreshHud("Power meter live. Stop inside the target band.");
      return;
    }

    if (result.type === "throw") {
      this.resolveThrow(result);
    }
  }

  resolveThrow(throwData) {
    const disc = this.getSelectedDisc();
    const holeResult = this.holeResults[this.currentHoleIndex];

    holeResult.strokes += 1;

    if (throwData.accuracy.rating === "perfect") {
      this.sound.perfect();
    } else {
      this.sound.beep();
    }

    const outcome = planFlight({
      start: this.lie,
      aim: this.mouseWorld,
      power: throwData.power,
      accuracy: throwData.accuracy,
      disc,
      hole: this.currentHole,
    });

    this.animation = {
      path: outcome.path,
      startedAt: performance.now(),
      duration: 420 + outcome.path.length * 10,
      outcome,
    };

    this.throwSystem.reset();
    this.syncTargetPower();
    this.refreshHud(this.describeThrow(throwData, outcome));
  }

  completeThrow(outcome) {
    if (outcome.event === "tree") {
      this.sound.tree();
      this.holeResults[this.currentHoleIndex].strokes += 1;
      this.ui.showMessage("Tree Kick", "Clipped the rough. One penalty stroke and a rough drop.");
    } else if (outcome.event === "water") {
      this.sound.splash();
      this.holeResults[this.currentHoleIndex].strokes += 1;
      this.ui.showMessage("Splash Down", "Wet feet. One penalty stroke and a safe drop.");
    }

    this.lie = { ...outcome.resolvedLie };
    this.discSprite = { ...outcome.resolvedLie };
    this.syncTargetPower();

    if (outcome.holedOut) {
      this.sound.hole();
      const scoreText = scoreName(this.holeResults[this.currentHoleIndex].strokes - this.currentHole.par);
      this.ui.showMessage("Chains", `${scoreText}. Hole complete.`);
      this.transitionAt = performance.now() + HOLE_TRANSITION_MS;
      this.refreshHud(`${scoreText}. Walking to the next tee...`);
      return;
    }

    this.refreshHud(this.postShotStatus(outcome));
  }

  finishHoleTransition() {
    this.transitionAt = 0;
    this.currentHoleIndex += 1;

    if (this.currentHoleIndex >= this.holes.length) {
      this.finishRound();
      return;
    }

    this.startHole();
  }

  finishRound() {
    this.roundComplete = true;
    const totalStrokes = this.holeResults.reduce((sum, hole) => sum + hole.strokes, 0);
    const totalPar = this.holes.reduce((sum, hole) => sum + hole.par, 0);
    const relativeScore = totalStrokes - totalPar;

    this.save.roundsPlayed += 1;
    this.save.bestScore = this.save.roundsPlayed === 1
      ? relativeScore
      : Math.min(this.save.bestScore, relativeScore);
    this.persistSave();

    this.ui.showScoreboard({
      holes: this.holeResults,
      totalStrokes,
      totalPar,
      relativeScore,
      bestScore: this.save.bestScore,
      roundsPlayed: this.save.roundsPlayed,
    });
    this.ui.showMessage("Round Complete", `Final score ${formatRelativeScore(relativeScore)}. Hit Play Again for a new card.`);
    this.refreshHud("Round complete.");
  }

  async toggleMusic() {
    this.sound.unlock();
    if (!this.selectedTrackId) {
      this.ui.showMessage("No Track Loaded", "Add tracks to tracks/manifest.json, then pick one from the menu.");
      return;
    }

    const nextEnabled = !this.save.musicEnabled;
    const started = await this.music.setEnabled(nextEnabled);

    this.save.musicEnabled = nextEnabled && started;
    this.persistSave();
    this.ui.updateMusicToggle(this.save.musicEnabled);

    if (nextEnabled && !started) {
      this.ui.showMessage("Music Blocked", "Browser audio needs a direct interaction. Click Music again if it did not start.");
      return;
    }

    this.refreshHud(this.save.musicEnabled ? "Background music on." : "Background music off.");
  }

  async selectTrack(trackId) {
    const track = this.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      return;
    }

    this.selectedTrackId = track.id;
    this.save.selectedTrackId = track.id;
    this.persistSave();

    const started = await this.music.setTrack(track.path, this.save.musicEnabled);
    if (this.save.musicEnabled && !started) {
      this.save.musicEnabled = false;
      this.persistSave();
      this.ui.updateMusicToggle(false);
      this.ui.showMessage("Music Blocked", "Browser audio needs a direct interaction. Pick the track again if it did not start.");
    }
  }

  frame(timestamp) {
    const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    this.throwSystem.update(deltaSeconds);
    this.ui.updateMeter(this.throwSystem.getMeterState());

    if (this.animation) {
      const elapsed = timestamp - this.animation.startedAt;
      const progress = clamp(elapsed / this.animation.duration, 0, 1);
      const sampleIndex = Math.min(
        this.animation.path.length - 1,
        Math.floor(progress * (this.animation.path.length - 1))
      );
      this.discSprite = this.animation.path[sampleIndex];

      if (progress >= 1) {
        const outcome = this.animation.outcome;
        this.animation = null;
        this.completeThrow(outcome);
      }
    }

    if (this.transitionAt && timestamp >= this.transitionAt) {
      this.finishHoleTransition();
    }

    this.render();
    requestAnimationFrame((nextTimestamp) => this.frame(nextTimestamp));
  }

  render() {
    this.drawWorld(this.worldContext);
    this.displayContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.displayContext.drawImage(this.worldCanvas, 0, 0, this.canvas.width, this.canvas.height);
  }

  drawWorld(context) {
    const hole = this.currentHole;
    if (!hole) {
      return;
    }

    context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawGrass(context, hole.paletteShift);
    this.drawFairway(context, hole);
    this.drawWater(context, hole.waters);
    this.drawTee(context, hole.tee);
    this.drawBasket(context, hole.basket);
    this.drawTrees(context, hole.trees);

    if (!this.roundComplete) {
      this.drawAimGuide(context);
    }

    if (this.animation) {
      this.drawTrail(context, this.animation.path);
    }

    this.drawDisc(context, this.discSprite, this.getSelectedDisc().color);
  }

  drawGrass(context, paletteShift) {
    const palettes = [
      ["#3e6f39", "#477c41", "#5a904e"],
      ["#3c6737", "#49793f", "#5b8a4b"],
      ["#406a33", "#4c7c3e", "#67914f"],
      ["#366532", "#447a3d", "#598d4c"],
    ];
    const palette = palettes[paletteShift];

    for (let y = 0; y < WORLD_HEIGHT; y += 8) {
      for (let x = 0; x < WORLD_WIDTH; x += 8) {
        const colorIndex = (x / 8 + y / 8) % palette.length;
        context.fillStyle = palette[colorIndex];
        context.fillRect(x, y, 8, 8);
        context.fillStyle = "rgba(0,0,0,0.08)";
        context.fillRect(x + ((x + y) % 6), y + ((x * 2 + y) % 5), 1, 1);
      }
    }
  }

  drawFairway(context, hole) {
    context.lineCap = "round";
    context.lineJoin = "round";

    context.strokeStyle = "#4f6d2f";
    context.lineWidth = hole.fairwayWidth + 10;
    context.beginPath();
    context.moveTo(hole.tee.x, hole.tee.y);
    context.quadraticCurveTo(hole.fairwayControl.x, hole.fairwayControl.y, hole.basket.x, hole.basket.y);
    context.stroke();

    context.strokeStyle = "#7ca34c";
    context.lineWidth = hole.fairwayWidth;
    context.stroke();

    context.strokeStyle = "rgba(255,255,255,0.16)";
    context.lineWidth = 2;
    context.setLineDash([5, 7]);
    context.stroke();
    context.setLineDash([]);
  }

  drawWater(context, waters) {
    waters.forEach((water) => {
      context.fillStyle = "#144a75";
      context.beginPath();
      context.ellipse(water.x, water.y, water.rx + 2, water.ry + 2, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#2d7ea7";
      context.beginPath();
      context.ellipse(water.x, water.y, water.rx, water.ry, 0, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(169, 225, 255, 0.35)";
      context.lineWidth = 1;
      for (let line = -water.ry + 2; line < water.ry; line += 5) {
        context.beginPath();
        context.moveTo(water.x - water.rx * 0.8, water.y + line);
        context.lineTo(water.x + water.rx * 0.8, water.y + line + 1);
        context.stroke();
      }
    });
  }

  drawTrees(context, trees) {
    trees.forEach((tree) => {
      context.fillStyle = "rgba(0,0,0,0.2)";
      context.fillRect(tree.x - tree.radius, tree.y + tree.radius - 1, tree.radius * 2, 3);
      context.fillStyle = "#54351b";
      context.fillRect(tree.x - 1, tree.y + tree.radius - 1, 3, 6);
      context.fillStyle = "#285b24";
      context.beginPath();
      context.arc(tree.x, tree.y, tree.radius + 1, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#4b8b3c";
      context.fillRect(tree.x - tree.radius, tree.y - tree.radius, tree.radius * 2, tree.radius * 2);
      context.fillStyle = "#78bc63";
      context.fillRect(tree.x - tree.radius + 1, tree.y - tree.radius + 1, tree.radius, tree.radius - 1);
    });
  }

  drawTee(context, tee) {
    context.fillStyle = "#d6c56b";
    context.fillRect(tee.x - 4, tee.y - 4, 8, 8);
    context.fillStyle = "#8f7c37";
    context.fillRect(tee.x - 2, tee.y - 2, 4, 4);
  }

  drawBasket(context, basket) {
    context.fillStyle = "#9f9f8d";
    context.fillRect(basket.x - 1, basket.y - 10, 3, 16);
    context.fillStyle = "#c55a31";
    context.fillRect(basket.x - 7, basket.y - 9, 14, 3);
    context.fillStyle = "#ebe9d8";
    for (let chain = -5; chain <= 5; chain += 2) {
      context.fillRect(basket.x + chain, basket.y - 6, 1, 6);
    }
    context.fillStyle = "#686851";
    context.fillRect(basket.x - 6, basket.y + 5, 12, 2);
  }

  drawAimGuide(context) {
    if (this.animation || this.transitionAt) {
      return;
    }

    const disc = this.getSelectedDisc();
    const preview = planFlight({
      start: this.lie,
      aim: this.mouseWorld,
      power: 0.82,
      accuracy: { magnitude: 0, sign: 0 },
      disc,
      hole: { ...this.currentHole, trees: [], waters: [] },
    });
    const previewPath = buildPath(this.lie, preview.control, preview.end, 22);

    context.strokeStyle = "rgba(255, 246, 184, 0.72)";
    context.lineWidth = 2;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(previewPath[0].x, previewPath[0].y);
    previewPath.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "rgba(255, 246, 184, 0.75)";
    context.fillRect(this.mouseWorld.x - 2, this.mouseWorld.y - 2, 4, 4);
    context.fillRect(this.lie.x - 2, this.lie.y - 2, 4, 4);
  }

  drawTrail(context, path) {
    context.strokeStyle = "rgba(255, 217, 102, 0.75)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(path[0].x, path[0].y);
    path.forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }

  drawDisc(context, point, color) {
    context.fillStyle = "rgba(0,0,0,0.25)";
    context.fillRect(point.x - 3, point.y + 3, 8, 2);
    context.fillStyle = color;
    context.fillRect(point.x - 3, point.y - 2, 8, 4);
    context.fillStyle = "#fff7d0";
    context.fillRect(point.x - 1, point.y - 1, 3, 1);
  }

  refreshHud(status) {
    const safeHoleIndex = Math.min(this.currentHoleIndex, this.holes.length - 1);
    const currentHole = this.holes[safeHoleIndex] || this.currentHole;
    const currentResult = this.holeResults[safeHoleIndex] || this.holeResults[this.holeResults.length - 1];
    const distanceFeet = Math.round(distanceBetween(this.lie, currentHole.basket) * FEET_PER_UNIT);

    this.ui.updateHud({
      holeNumber: safeHoleIndex + 1,
      totalHoles: this.holes.length,
      par: currentHole.par,
      stroke: currentResult.strokes + (this.roundComplete ? 0 : 1),
      distanceFeet,
    });
  }

  syncTargetPower() {
    const currentHole = this.holes?.[Math.min(this.currentHoleIndex, this.holes.length - 1)] || this.currentHole;
    if (!currentHole || !this.lie) {
      return;
    }

    const disc = this.getSelectedDisc();
    const distanceToBasket = distanceBetween(this.lie, currentHole.basket);
    const targetPower = (distanceToBasket / disc.maxDistance - 0.22) / 0.9;
    this.throwSystem.setTargetPower(targetPower);
  }

  describeThrow(throwData, outcome) {
    const powerPercent = Math.round(throwData.power * 100);
    const targetPercent = Math.round(throwData.targetPower * 100);
    const accuracyText = throwData.accuracy.rating === "perfect"
      ? "perfect snap"
      : throwData.accuracy.rating === "solid"
        ? "solid release"
        : "wild release";

    if (outcome.event === "tree") {
      return `${powerPercent}% power on a ${targetPercent}% target, ${accuracyText}. Kicked into a tree.`;
    }

    if (outcome.event === "water") {
      return `${powerPercent}% power on a ${targetPercent}% target, ${accuracyText}. Parked in the drink.`;
    }

    if (outcome.holedOut) {
      return `${powerPercent}% power on a ${targetPercent}% target, ${accuracyText}. Dead center into the chains.`;
    }

    return `${powerPercent}% power on a ${targetPercent}% target, ${accuracyText}. Disc is in bounds.`;
  }

  postShotStatus(outcome) {
    const remaining = Math.round(distanceBetween(outcome.resolvedLie, this.currentHole.basket) * FEET_PER_UNIT);

    if (outcome.event === "tree") {
      return `Rough lie after the tree kick. ${remaining} ft left.`;
    }

    if (outcome.event === "water") {
      return `Safe drop taken. ${remaining} ft left.`;
    }

    return `${remaining} ft to the basket.`;
  }

  getSelectedDisc() {
    return DISCS.find((disc) => disc.id === this.selectedDiscId) || DISCS[0];
  }

  async loadTracks() {
    try {
      const response = await fetch(TRACK_MANIFEST_PATH);
      const manifest = await response.json();
      this.tracks = Array.isArray(manifest.tracks)
        ? manifest.tracks
            .filter((track) => track?.id && track?.label && track?.file)
            .map((track) => ({
              id: track.id,
              label: track.label,
              file: track.file,
              path: `./tracks/${track.file}`,
            }))
        : [];
    } catch {
      this.tracks = [];
    }

    const selectedTrack = this.tracks.find((track) => track.id === this.save.selectedTrackId) || this.tracks[0] || null;

    if (!selectedTrack) {
      this.ui.renderTrackOptions([], "");
      this.selectedTrackId = "";
      return;
    }

    this.selectedTrackId = selectedTrack.id;
    this.save.selectedTrackId = selectedTrack.id;
    this.persistSave();
    this.ui.renderTrackOptions(this.tracks, selectedTrack.id);
    await this.music.setTrack(selectedTrack.path, false);
  }

  loadSave() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { bestScore: 0, roundsPlayed: 0, musicEnabled: false, selectedTrackId: "" };
      }

      const parsed = JSON.parse(raw);
      return {
        bestScore: typeof parsed.bestScore === "number" ? parsed.bestScore : 0,
        roundsPlayed: typeof parsed.roundsPlayed === "number" ? parsed.roundsPlayed : 0,
        musicEnabled: Boolean(parsed.musicEnabled),
        selectedTrackId: typeof parsed.selectedTrackId === "string" ? parsed.selectedTrackId : "",
      };
    } catch {
      return { bestScore: 0, roundsPlayed: 0, musicEnabled: false, selectedTrackId: "" };
    }
  }

  persistSave() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.save));
  }
}

function scoreName(relativeToPar) {
  if (relativeToPar <= -2) {
    return "Eagle";
  }

  if (relativeToPar === -1) {
    return "Birdie";
  }

  if (relativeToPar === 0) {
    return "Par";
  }

  if (relativeToPar === 1) {
    return "Bogey";
  }

  return "Double Bogey+";
}

new RetroDiscGolfGame();
