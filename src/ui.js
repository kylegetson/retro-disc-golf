import { formatRelativeScore } from "./discPhysics.js";

export class UI {
  constructor({ discs, onDiscSelect, onPlayAgain, onToggleMusic, onTrackSelect }) {
    this.discs = discs;
    this.onDiscSelect = onDiscSelect;

    this.refs = {
      holeLabel: document.getElementById("holeLabel"),
      parLabel: document.getElementById("parLabel"),
      strokeLabel: document.getElementById("strokeLabel"),
      distanceLabel: document.getElementById("distanceLabel"),
      selectedDiscLabel: document.getElementById("selectedDiscLabel"),
      meterStateLabel: document.getElementById("meterStateLabel"),
      meterNeedle: document.getElementById("meterNeedle"),
      meterSweetSpot: document.getElementById("meterSweetSpot"),
      meterHint: document.getElementById("meterHint"),
      messageBox: document.getElementById("messageBox"),
      messageTitle: document.getElementById("messageTitle"),
      messageBody: document.getElementById("messageBody"),
      discBar: document.getElementById("discBar"),
      scoreboardScreen: document.getElementById("scoreboardScreen"),
      scoreRows: document.getElementById("scoreRows"),
      totalScoreLabel: document.getElementById("totalScoreLabel"),
      relativeScoreLabel: document.getElementById("relativeScoreLabel"),
      bestScoreLabel: document.getElementById("bestScoreLabel"),
      roundsPlayedLabel: document.getElementById("roundsPlayedLabel"),
      playAgainButton: document.getElementById("playAgainButton"),
      musicToggleButton: document.getElementById("musicToggleButton"),
      trackSelect: document.getElementById("trackSelect"),
    };

    this.refs.playAgainButton.addEventListener("click", onPlayAgain);
    this.refs.musicToggleButton.addEventListener("click", onToggleMusic);
    this.refs.trackSelect.addEventListener("change", (event) => onTrackSelect(event.target.value));
    this.renderDiscButtons();
  }

  renderDiscButtons() {
    this.refs.discBar.innerHTML = "";

    this.discs.forEach((disc) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "disc-button";
      button.dataset.discId = disc.id;
      button.innerHTML = `<strong>${disc.shortLabel}</strong><span>${disc.note}</span>`;
      button.addEventListener("click", () => this.onDiscSelect(disc.id));
      this.refs.discBar.appendChild(button);
    });
  }

  updateDiscSelection(disc) {
    this.refs.selectedDiscLabel.textContent = disc.label;

    [...this.refs.discBar.children].forEach((button) => {
      button.classList.toggle("active", button.dataset.discId === disc.id);
    });
  }

  updateHud({ holeNumber, totalHoles, par, stroke, distanceFeet }) {
    this.refs.holeLabel.textContent = `${holeNumber} / ${totalHoles}`;
    this.refs.parLabel.textContent = String(par);
    this.refs.strokeLabel.textContent = String(stroke);
    this.refs.distanceLabel.textContent = `${distanceFeet} ft`;
  }

  updateMeter(meterState) {
    this.refs.meterStateLabel.textContent = meterState.label;
    this.refs.meterHint.textContent = meterState.hint;
    this.refs.meterNeedle.style.left = `${meterState.needlePosition * 100}%`;
    this.refs.meterSweetSpot.style.left = `${meterState.sweetSpotCenter * 100}%`;
    this.refs.meterSweetSpot.style.width = `${meterState.sweetSpotWidth * 100}%`;
  }

  showMessage(title, body) {
    this.refs.messageTitle.textContent = title;
    this.refs.messageBody.textContent = body;
    this.refs.messageBox.classList.remove("hidden");
  }

  hideMessage() {
    this.refs.messageBox.classList.add("hidden");
  }

  showScoreboard({ holes, totalStrokes, totalPar, relativeScore, bestScore, roundsPlayed }) {
    this.refs.scoreRows.innerHTML = "";

    holes.forEach((hole, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${index + 1}</td><td>${hole.par}</td><td>${hole.strokes}</td>`;
      this.refs.scoreRows.appendChild(row);
    });

    this.refs.totalScoreLabel.textContent = String(totalStrokes);
    this.refs.relativeScoreLabel.textContent = formatRelativeScore(relativeScore);
    this.refs.bestScoreLabel.textContent = formatRelativeScore(bestScore);
    this.refs.roundsPlayedLabel.textContent = String(roundsPlayed);
    this.refs.scoreboardScreen.classList.remove("hidden");
  }

  hideScoreboard() {
    this.refs.scoreboardScreen.classList.add("hidden");
  }

  updateMusicToggle(enabled) {
    this.refs.musicToggleButton.textContent = enabled ? "Music On" : "Music Off";
    this.refs.musicToggleButton.setAttribute("aria-pressed", String(enabled));
  }

  renderTrackOptions(tracks, selectedTrackId) {
    this.refs.trackSelect.innerHTML = "";

    tracks.forEach((track) => {
      const option = document.createElement("option");
      option.value = track.id;
      option.textContent = track.label;
      option.selected = track.id === selectedTrackId;
      this.refs.trackSelect.appendChild(option);
    });

    this.refs.trackSelect.disabled = tracks.length === 0;
  }
}
