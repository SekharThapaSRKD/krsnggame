const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const actValue = document.getElementById("actValue");
const missionValue = document.getElementById("missionValue");
const heartsValue = document.getElementById("heartsValue");
const blessingValue = document.getElementById("blessingValue");
const objectiveValue = document.getElementById("objectiveValue");

const dialogueSpeaker = document.getElementById("dialogueSpeaker");
const dialogueTitle = document.getElementById("dialogueTitle");
const dialogueText = document.getElementById("dialogueText");
const dialogueHint = document.getElementById("dialogueHint");
const primaryButton = document.getElementById("primaryButton");
const secondaryButton = document.getElementById("secondaryButton");

const currentActTitle = document.getElementById("currentActTitle");
const currentActSummary = document.getElementById("currentActSummary");
const timelineList = document.getElementById("timelineList");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const STORAGE_KEY = "krishna-story-mode-best";

const input = {
  held: {
    left: false,
    up: false,
    right: false,
    down: false,
    action: false,
  },
  pressed: {
    left: false,
    up: false,
    right: false,
    down: false,
    action: false,
  },
};

function readBestScore() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function persistBestScore() {
  try {
    localStorage.setItem(STORAGE_KEY, String(state.best));
  } catch {
    // Ignore browser storage failures.
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWrappedText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  words.forEach((word, index) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
      line = word;
    } else {
      line = candidate;
    }

    if (index === words.length - 1) {
      ctx.fillText(line, x, currentY);
    }
  });

  return currentY;
}

function setControl(control, isDown) {
  if (!(control in input.held)) {
    return;
  }

  if (isDown && !input.held[control]) {
    input.pressed[control] = true;
  }

  input.held[control] = isDown;
}

function consumePressed() {
  const snapshot = { ...input.pressed };
  Object.keys(input.pressed).forEach((key) => {
    input.pressed[key] = false;
  });
  return snapshot;
}

function clearInput() {
  Object.keys(input.held).forEach((key) => {
    input.held[key] = false;
    input.pressed[key] = false;
  });
}

function spawnParticles(x, y, color, count, force) {
  for (let index = 0; index < count; index += 1) {
    const angle = randomRange(0, Math.PI * 2);
    const speed = randomRange(force * 0.35, force);
    const life = randomRange(0.35, 0.85);

    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: randomRange(2, 5),
      color,
    });
  }
}

function updateParticles(dt) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
    particle.vy += 180 * dt;

    if (particle.life <= 0) {
      state.particles.splice(index, 1);
    }
  }
}

function drawParticles() {
  state.particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function makePlayer(x, y, variant, health, speed) {
  return {
    x,
    y,
    r: 18,
    variant,
    health,
    maxHealth: health,
    speed,
    faceX: 0,
    faceY: -1,
    attackCooldown: 0,
    attackTimer: 0,
    invuln: 0,
    actionCooldown: 0,
  };
}

function updatePlayerCore(player, dt) {
  player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  player.attackTimer = Math.max(0, player.attackTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.actionCooldown = Math.max(0, player.actionCooldown - dt);
}

function movePlayer(player, dt, bounds) {
  const axisX = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const axisY = (input.held.down ? 1 : 0) - (input.held.up ? 1 : 0);
  const length = Math.hypot(axisX, axisY) || 1;

  if (axisX !== 0 || axisY !== 0) {
    player.faceX = axisX / length;
    player.faceY = axisY / length;
  }

  player.x += (axisX / length) * player.speed * dt;
  player.y += (axisY / length) * player.speed * dt;
  player.x = clamp(player.x, bounds.left + player.r, bounds.right - player.r);
  player.y = clamp(player.y, bounds.top + player.r, bounds.bottom - player.r);
}

function actionPressed(pressed) {
  return pressed.action || pressed.up;
}

function tryAttack(player, pressed) {
  if (!actionPressed(pressed) || player.attackCooldown > 0) {
    return false;
  }

  player.attackCooldown = 0.34;
  player.attackTimer = 0.16;
  return true;
}

function hurtPlayer(scene, amount, failureText) {
  const player = scene.player;
  if (player.invuln > 0 || state.mode !== "play") {
    return;
  }

  player.health -= amount;
  player.invuln = 1;
  spawnParticles(player.x, player.y, "#ff9a87", 16, 190);

  if (player.health <= 0) {
    failAct(failureText);
  }
}

function completeAct(resultText, bonus = 120) {
  const scene = state.actState;
  if (!scene || state.mode !== "play") {
    return;
  }

  const earned = Math.floor(scene.score || 0) + bonus;
  state.blessings += earned;
  state.mode = "dialogue";
  state.dialogueKind = "outro";
  state.dialogueIndex = 0;
  state.resultText = `${resultText} You earned ${earned} blessings in this act.`;
  clearInput();
  renderTimeline();
  updatePanels();
}

function failAct(message) {
  state.mode = "failed";
  state.failureText = message;
  clearInput();
  updatePanels();
}

function startAct(index) {
  state.actIndex = index;
  state.actState = acts[index].build();
  state.mode = "dialogue";
  state.dialogueKind = "intro";
  state.dialogueIndex = 0;
  state.resultText = "";
  state.failureText = "";
  clearInput();
  renderTimeline();
  updatePanels();
}

function startStory() {
  state.blessings = 0;
  startAct(0);
}

function retryAct() {
  startAct(state.actIndex);
}

function restartStory() {
  state.mode = "menu";
  state.actIndex = 0;
  state.actState = null;
  state.resultText = "";
  state.failureText = "";
  clearInput();
  renderTimeline();
  updatePanels();
}

function finishStory() {
  state.mode = "complete";
  state.best = Math.max(state.best, state.blessings);
  persistBestScore();
  renderTimeline();
  updatePanels();
}

function currentDialogueLines() {
  const act = acts[state.actIndex];
  if (!act) {
    return [];
  }

  if (state.dialogueKind === "intro") {
    return act.intro;
  }

  return [{ speaker: "Narrator", text: state.resultText }, ...act.outro];
}

function advanceDialogue() {
  if (state.mode === "menu") {
    startStory();
    return;
  }

  if (state.mode === "failed") {
    retryAct();
    return;
  }

  if (state.mode === "complete") {
    startStory();
    return;
  }

  if (state.mode !== "dialogue") {
    return;
  }

  const lines = currentDialogueLines();
  if (state.dialogueIndex < lines.length - 1) {
    state.dialogueIndex += 1;
    updatePanels();
    return;
  }

  if (state.dialogueKind === "intro") {
    state.mode = "play";
    clearInput();
    updatePanels();
    return;
  }

  if (state.actIndex >= acts.length - 1) {
    finishStory();
  } else {
    startAct(state.actIndex + 1);
  }
}

function line(speaker, text) {
  return { speaker, text };
}

function actCardLabel(index) {
  return `Act ${index + 1}`;
}

function renderTimeline() {
  timelineList.innerHTML = "";

  acts.forEach((act, index) => {
    const item = document.createElement("div");
    item.className = "timeline-step";

    if (index < state.actIndex || (state.mode === "complete" && index <= state.actIndex)) {
      item.classList.add("complete");
    }
    if (index === state.actIndex && state.mode !== "menu") {
      item.classList.add("current");
    }

    const tag = document.createElement("span");
    tag.textContent = `${actCardLabel(index)} • ${act.category}`;

    const title = document.createElement("strong");
    title.textContent = act.title;

    const text = document.createElement("p");
    text.textContent = act.chapters.join(" • ");

    item.append(tag, title, text);
    timelineList.append(item);
  });
}

function updatePanels() {
  if (state.mode === "menu") {
    actValue.textContent = "Story Menu";
    missionValue.textContent = "Begin the journey";
    heartsValue.textContent = `Best ${state.best}`;
    blessingValue.textContent = "0";
    objectiveValue.textContent = "Start story mode";
    currentActTitle.textContent = "Six Story Acts";
    currentActSummary.textContent =
      "The full leela list is grouped into six real playable acts with dialogue, movement, combat, rescue, and boss encounters.";

    dialogueSpeaker.textContent = "Story Mode";
    dialogueTitle.textContent = "A Journey Through Krishna Leela";
    dialogueText.textContent =
      "This build is no longer a card-heavy chapter list. It is a real story-mode game with playable acts based on your Krishna leela order.";
    dialogueHint.textContent =
      "Use Arrow keys or WASD to move. Use Space, Enter, F, or E to act or continue.";
    primaryButton.hidden = false;
    primaryButton.textContent = "Start Story";
    secondaryButton.hidden = true;
    return;
  }

  const act = acts[state.actIndex];
  const scene = state.actState;

  actValue.textContent = `${actCardLabel(state.actIndex)} • ${act.title}`;
  missionValue.textContent = act.mission;
  heartsValue.textContent =
    scene && scene.player ? `${scene.player.health}/${scene.player.maxHealth}` : "--";
  blessingValue.textContent = String(state.blessings);
  objectiveValue.textContent = act.objective(scene);

  currentActTitle.textContent = act.title;
  currentActSummary.textContent =
    state.mode === "play" ? act.status(scene) : act.summary;

  if (state.mode === "dialogue") {
    const lines = currentDialogueLines();
    const current = lines[state.dialogueIndex];

    dialogueSpeaker.textContent = current.speaker;
    dialogueTitle.textContent = act.title;
    dialogueText.textContent = current.text;
    dialogueHint.textContent =
      state.dialogueKind === "intro"
        ? "Continue through the story, then begin the mission."
        : state.actIndex === acts.length - 1
          ? "Finish the last act to complete the story."
          : "Continue to the next act when you are ready.";

    primaryButton.hidden = false;
    primaryButton.textContent =
      state.dialogueIndex === lines.length - 1
        ? state.dialogueKind === "intro"
          ? "Begin Mission"
          : state.actIndex === acts.length - 1
            ? "Finish Story"
            : "Next Act"
        : "Continue";

    secondaryButton.hidden = true;
    return;
  }

  if (state.mode === "play") {
    dialogueSpeaker.textContent = act.category;
    dialogueTitle.textContent = act.title;
    dialogueText.textContent = act.status(scene);
    dialogueHint.textContent = act.playHint;

    primaryButton.hidden = true;
    secondaryButton.hidden = false;
    secondaryButton.textContent = "Restart Act";
    return;
  }

  if (state.mode === "failed") {
    dialogueSpeaker.textContent = "Mission Failed";
    dialogueTitle.textContent = act.title;
    dialogueText.textContent = state.failureText;
    dialogueHint.textContent = "Retry this act or restart the whole story journey.";
    primaryButton.hidden = false;
    primaryButton.textContent = "Retry Mission";
    secondaryButton.hidden = false;
    secondaryButton.textContent = "Restart Story";
    return;
  }

  if (state.mode === "complete") {
    dialogueSpeaker.textContent = "Story Complete";
    dialogueTitle.textContent = "Krishna Story Mode Complete";
    dialogueText.textContent =
      `You completed all ${acts.length} acts with ${state.blessings} blessings. ` +
      "The story mode now carries the Krishna leela arc from birth to the final pastimes in one real playable journey.";
    dialogueHint.textContent = "Start again to replay the full story mode.";
    primaryButton.hidden = false;
    primaryButton.textContent = "Play Again";
    secondaryButton.hidden = true;
  }
}

function drawShadow(x, y, width, height) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawKrishna(player, options = {}) {
  const aura = Boolean(options.aura);
  const armRaised = Boolean(options.armRaised);
  const flute = Boolean(options.flute);
  const playerAlpha = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0 ? 0.55 : 1;

  ctx.save();
  ctx.globalAlpha = playerAlpha;
  ctx.translate(player.x, player.y);

  if (aura) {
    const glow = ctx.createRadialGradient(0, -20, 14, 0, -20, 50);
    glow.addColorStop(0, "rgba(132, 230, 217, 0.34)");
    glow.addColorStop(1, "rgba(132, 230, 217, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -20, 50, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShadow(0, 18, 16, 7);

  ctx.fillStyle = "#f1c74b";
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.lineTo(-18, 22);
  ctx.lineTo(0, 28);
  ctx.lineTo(18, 22);
  ctx.lineTo(14, 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff984c";
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(4, 6, 13, 20);
  ctx.lineTo(6, 22);
  ctx.quadraticCurveTo(-3, 14, -12, 0);
  ctx.fill();

  ctx.strokeStyle = "#5d7dd8";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 24);
  ctx.lineTo(-8, 40);
  ctx.moveTo(6, 24);
  ctx.lineTo(8, 40);
  ctx.moveTo(-2, 0);
  ctx.lineTo(-12, armRaised ? -28 : -10);
  ctx.moveTo(2, -2);
  ctx.lineTo(armRaised ? 14 : 12, armRaised ? -30 : -12);
  ctx.stroke();

  if (flute) {
    ctx.strokeStyle = "#d8b25f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -10);
    ctx.lineTo(16, -12);
    ctx.stroke();
  }

  ctx.fillStyle = "#4a77dc";
  ctx.beginPath();
  ctx.arc(0, -14, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#162440";
  ctx.beginPath();
  ctx.arc(0, -20, 16, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffdc7b";
  ctx.beginPath();
  ctx.arc(0, -28, 8, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-8, -28, 16, 5);

  ctx.fillStyle = "#173b74";
  ctx.beginPath();
  ctx.arc(-5, -15, 1.8, 0, Math.PI * 2);
  ctx.arc(5, -15, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#173b74";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.quadraticCurveTo(0, -4, 5, -8);
  ctx.stroke();

  ctx.save();
  ctx.translate(8, -34);
  ctx.rotate(-0.28);
  ctx.strokeStyle = "#fff2b1";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(4, -4);
  ctx.stroke();

  const feather = ctx.createLinearGradient(0, 0, 10, 22);
  feather.addColorStop(0, "#67e6d8");
  feather.addColorStop(0.45, "#2abda1");
  feather.addColorStop(1, "#214f9d");
  ctx.fillStyle = feather;
  ctx.beginPath();
  ctx.moveTo(4, -4);
  ctx.quadraticCurveTo(-7, 0, -3, 14);
  ctx.quadraticCurveTo(5, 4, 11, -3);
  ctx.quadraticCurveTo(8, -4, 4, -4);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawVasudeva(player) {
  const playerAlpha = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0 ? 0.55 : 1;

  ctx.save();
  ctx.globalAlpha = playerAlpha;
  ctx.translate(player.x, player.y);

  drawShadow(0, 20, 18, 8);

  ctx.fillStyle = "#8e5e46";
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-14, 26);
  ctx.lineTo(0, 34);
  ctx.lineTo(14, 26);
  ctx.lineTo(18, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#c18a6a";
  ctx.beginPath();
  ctx.arc(0, -10, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f4dfc4";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-12, -18);
  ctx.moveTo(6, 4);
  ctx.lineTo(12, -18);
  ctx.moveTo(-6, 30);
  ctx.lineTo(-8, 44);
  ctx.moveTo(6, 30);
  ctx.lineTo(8, 44);
  ctx.stroke();

  ctx.fillStyle = "#b47c49";
  roundedRect(-12, -38, 24, 16, 7);
  ctx.fill();
  ctx.fillStyle = "#ffe8a8";
  ctx.beginPath();
  ctx.arc(0, -30, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHero(player, options = {}) {
  if (player.variant === "vasudeva") {
    drawVasudeva(player);
    return;
  }

  drawKrishna(player, options);
}

function drawButterPot(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#a26035";
  ctx.beginPath();
  ctx.ellipse(0, 14, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#bc7746";
  roundedRect(-16, -10, 32, 24, 10);
  ctx.fill();

  ctx.fillStyle = "#ffe8a1";
  ctx.beginPath();
  ctx.arc(-5, -5, 7, Math.PI, Math.PI * 2);
  ctx.arc(5, -3, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCow(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f4f0df";
  roundedRect(-20, -12, 40, 22, 10);
  ctx.fill();

  ctx.fillStyle = "#d4aa6b";
  ctx.beginPath();
  ctx.ellipse(24, -3, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f4f0df";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, 9);
  ctx.lineTo(-10, 24);
  ctx.moveTo(0, 9);
  ctx.lineTo(0, 24);
  ctx.moveTo(10, 9);
  ctx.lineTo(10, 24);
  ctx.stroke();
  ctx.restore();
}

function drawVillager(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f4d8a9";
  ctx.beginPath();
  ctx.arc(0, -16, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e7835f";
  ctx.beginPath();
  ctx.moveTo(-12, 14);
  ctx.lineTo(-10, -6);
  ctx.lineTo(10, -6);
  ctx.lineTo(12, 14);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f6e4ca";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, 14);
  ctx.lineTo(-5, 28);
  ctx.moveTo(5, 14);
  ctx.lineTo(5, 28);
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = enemy.color;
  ctx.strokeStyle = "rgba(12, 24, 46, 0.45)";
  ctx.lineWidth = 3;

  if (enemy.type === "storm") {
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff3d8";
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.bezierCurveTo(14, -12, -12, 4, 10, 10);
    ctx.stroke();
  } else if (enemy.type === "witch") {
    ctx.beginPath();
    ctx.moveTo(0, -enemy.r);
    ctx.lineTo(-enemy.r, enemy.r);
    ctx.lineTo(enemy.r, enemy.r);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.type === "crane") {
    ctx.beginPath();
    ctx.ellipse(0, 0, enemy.r + 6, enemy.r - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffcb78";
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(enemy.r + 20, 4);
    ctx.lineTo(4, 10);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.type === "serpent") {
    ctx.beginPath();
    ctx.ellipse(0, 2, enemy.r, enemy.r + 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "bull") {
    roundedRect(-enemy.r, -enemy.r + 2, enemy.r * 2, enemy.r * 1.6, 12);
    ctx.fill();
    ctx.strokeStyle = "#ffe7bf";
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(-22, -22);
    ctx.moveTo(10, -10);
    ctx.lineTo(22, -22);
    ctx.stroke();
  } else if (enemy.type === "horse") {
    roundedRect(-enemy.r, -enemy.r, enemy.r * 2, enemy.r * 1.7, 14);
    ctx.fill();
  } else if (enemy.type === "elephant") {
    ctx.beginPath();
    ctx.ellipse(0, 0, enemy.r + 6, enemy.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cad4e3";
    ctx.beginPath();
    ctx.ellipse(enemy.r - 2, -2, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cad4e3";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(enemy.r + 8, 8);
    ctx.quadraticCurveTo(enemy.r + 18, 24, enemy.r + 2, 32);
    ctx.stroke();
  } else if (enemy.type === "wrestler") {
    roundedRect(-enemy.r, -enemy.r, enemy.r * 2, enemy.r * 2, 12);
    ctx.fill();
    ctx.fillStyle = "#ffe3b1";
    ctx.beginPath();
    ctx.arc(0, -enemy.r - 8, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "king") {
    roundedRect(-enemy.r, -enemy.r, enemy.r * 2, enemy.r * 2, 12);
    ctx.fill();
    ctx.fillStyle = "#ffd96f";
    ctx.fillRect(-12, -enemy.r - 10, 24, 10);
  } else if (enemy.type === "cart") {
    roundedRect(-enemy.r, -enemy.r + 6, enemy.r * 2, enemy.r * 1.4, 10);
    ctx.fill();
    ctx.fillStyle = "#f3da92";
    ctx.fillRect(-12, -enemy.r - 8, 24, 12);
  } else if (enemy.type === "donkey") {
    roundedRect(-enemy.r, -enemy.r + 4, enemy.r * 2, enemy.r * 1.5, 12);
    ctx.fill();
    ctx.fillStyle = "#ead6c8";
    ctx.beginPath();
    ctx.ellipse(enemy.r - 2, -4, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (enemy.maxHealth > 1) {
    ctx.fillStyle = "rgba(8, 21, 42, 0.36)";
    roundedRect(-22, -enemy.r - 22, 44, 7, 4);
    ctx.fill();
    ctx.fillStyle = "#84e6d9";
    roundedRect(-22, -enemy.r - 22, 44 * (enemy.health / enemy.maxHealth), 7, 4);
    ctx.fill();
  }

  ctx.restore();
}

function circleHit(a, b) {
  return dist(a.x, a.y, b.x, b.y) <= a.r + b.r;
}

function rectHit(rect, x, y, radius = 0) {
  return (
    x + radius > rect.x &&
    x - radius < rect.x + rect.w &&
    y + radius > rect.y &&
    y - radius < rect.y + rect.h
  );
}

function drawMenuScene() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#0c1932");
  sky.addColorStop(0.42, "#23456c");
  sky.addColorStop(1, "#e3ba71");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 232, 176, 0.24)";
  ctx.beginPath();
  ctx.arc(770, 110, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(18, 44, 73, 0.35)";
  for (let shrine = 0; shrine < 5; shrine += 1) {
    const x = 80 + shrine * 190;
    ctx.beginPath();
    ctx.moveTo(x, 334);
    ctx.lineTo(x + 16, 286);
    ctx.lineTo(x + 36, 334);
    ctx.lineTo(x + 50, 258);
    ctx.lineTo(x + 70, 334);
    ctx.lineTo(x + 70, 362);
    ctx.lineTo(x, 362);
    ctx.closePath();
    ctx.fill();
  }

  const ground = ctx.createLinearGradient(0, 392, 0, HEIGHT);
  ground.addColorStop(0, "#649355");
  ground.addColorStop(1, "#1f4028");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 392, WIDTH, HEIGHT - 392);

  drawKrishna({ x: 480, y: 430, invuln: 0, variant: "krishna" }, { flute: true, aura: true });

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff7e0";
  ctx.font = '700 34px "Iowan Old Style", "Palatino Linotype", Georgia, serif';
  ctx.fillText("Real Story-Mode Krishna Game", 480, 92);
  ctx.font = '700 16px "Avenir Next", sans-serif';
  ctx.fillText("Storm crossing • Stealth • Boss fights • Rescue • Arena combat", 480, 122);
}

function drawStoryBackdrop(colors) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, colors.top);
  sky.addColorStop(0.5, colors.mid);
  sky.addColorStop(1, colors.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function updateStormCrossing(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 8;
  scene.progress = clamp((scene.player.y - scene.goal.y) / (scene.bounds.bottom - scene.goal.y), 0, 1);

  scene.hazards.forEach((hazard) => {
    hazard.y += hazard.speed * dt;
    hazard.x += Math.sin(state.globalTime * 2 + hazard.phase) * 24 * dt;
    if (hazard.y > HEIGHT + 30) {
      hazard.y = -randomRange(20, 140);
      hazard.x = randomRange(170, 790);
    }

    if (dist(scene.player.x, scene.player.y, hazard.x, hazard.y) < scene.player.r + hazard.r) {
      hazard.y = -randomRange(20, 140);
      hurtPlayer(scene, 1, "The Yamuna storm overwhelmed Vasudeva before he could reach Gokul.");
    }
  });

  if (rectHit(scene.goal, scene.player.x, scene.player.y, scene.player.r)) {
    completeAct("Vasudeva reaches Gokul safely with baby Krishna.", 160);
  }
}

function drawStormCrossing(scene) {
  drawStoryBackdrop({ top: "#09162c", mid: "#21436b", bottom: "#4d6d67" });

  ctx.fillStyle = "rgba(255, 242, 195, 0.2)";
  ctx.beginPath();
  ctx.arc(760, 96, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#102746";
  ctx.fillRect(150, 30, 660, 480);

  ctx.fillStyle = "#1f4d78";
  ctx.fillRect(190, 30, 580, 480);

  for (let rain = 0; rain < 80; rain += 1) {
    const x = (rain * 42 + state.globalTime * 240) % (WIDTH + 60) - 30;
    const y = (rain * 19 + state.globalTime * 290) % HEIGHT;
    ctx.strokeStyle = "rgba(183, 221, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + 18);
    ctx.stroke();
  }

  scene.stones.forEach((stone) => {
    ctx.fillStyle = "rgba(255, 247, 224, 0.16)";
    ctx.beginPath();
    ctx.ellipse(stone.x, stone.y, stone.w, stone.h, stone.rot, 0, Math.PI * 2);
    ctx.fill();
  });

  scene.hazards.forEach((hazard) => {
    ctx.fillStyle = "rgba(255, 214, 115, 0.3)";
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd66f";
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(132, 230, 217, 0.18)";
  roundedRect(scene.goal.x, scene.goal.y, scene.goal.w, scene.goal.h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(132, 230, 217, 0.5)";
  ctx.lineWidth = 3;
  roundedRect(scene.goal.x, scene.goal.y, scene.goal.w, scene.goal.h, 16);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff7e0";
  ctx.font = '700 15px "Avenir Next", sans-serif';
  ctx.fillText("Gokul Gate", scene.goal.x + scene.goal.w / 2, scene.goal.y - 10);

  drawHero(scene.player);
}

function updateMakhanCourtyard(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 10;

  scene.yashoda.x += scene.yashoda.dir * scene.yashoda.speed * dt;
  if (scene.yashoda.x < scene.yashoda.min || scene.yashoda.x > scene.yashoda.max) {
    scene.yashoda.dir *= -1;
  }

  const lampWidth = 160;
  const lampDepth = 280;
  const yFactor = clamp((scene.player.y - 110) / lampDepth, 0, 1);
  const beamHalf = lampWidth * (0.18 + yFactor);
  const inBeam =
    scene.player.y > 110 &&
    scene.player.y < 110 + lampDepth &&
    Math.abs(scene.player.x - scene.yashoda.x) < beamHalf;

  if (inBeam) {
    scene.detected += dt;
  } else {
    scene.detected = Math.max(0, scene.detected - dt * 1.3);
  }

  if (scene.detected >= 1.4) {
    failAct("Yashoda caught Krishna before he could finish the butter mischief.");
    return;
  }

  if (actionPressed(pressed)) {
    scene.pots.forEach((pot) => {
      if (!pot.collected && dist(scene.player.x, scene.player.y, pot.x, pot.y) < 42) {
        pot.collected = true;
        scene.collected += 1;
        scene.score += 55;
        spawnParticles(pot.x, pot.y, "#ffe5a1", 14, 170);
      }
    });
  }

  if (
    scene.collected >= scene.pots.length &&
    rectHit(scene.friendZone, scene.player.x, scene.player.y, scene.player.r)
  ) {
    completeAct("Krishna shares the butter and slips through the courtyard unseen.", 150);
  }
}

function drawMakhanCourtyard(scene) {
  drawStoryBackdrop({ top: "#f3d58b", mid: "#d08b56", bottom: "#7b5139" });

  ctx.fillStyle = "#7a5239";
  ctx.fillRect(0, 408, WIDTH, HEIGHT - 408);
  ctx.fillRect(0, 320, WIDTH, 20);

  ctx.fillStyle = "rgba(255, 240, 204, 0.14)";
  for (let column = 0; column < 6; column += 1) {
    ctx.fillRect(70 + column * 160, 68, 16, 244);
  }

  ctx.fillStyle = "rgba(255, 228, 160, 0.2)";
  ctx.beginPath();
  ctx.moveTo(scene.yashoda.x, 98);
  ctx.lineTo(scene.yashoda.x - 150, 390);
  ctx.lineTo(scene.yashoda.x + 150, 390);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#8d5e37";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(scene.yashoda.x, 46);
  ctx.lineTo(scene.yashoda.x, 90);
  ctx.stroke();

  ctx.fillStyle = "#ffd56d";
  ctx.beginPath();
  ctx.arc(scene.yashoda.x, 98, 14, 0, Math.PI * 2);
  ctx.fill();

  scene.pots.forEach((pot) => {
    if (!pot.collected) {
      ctx.strokeStyle = "#6f4328";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pot.x, 54);
      ctx.lineTo(pot.x, pot.y - 14);
      ctx.stroke();
      drawButterPot(pot.x, pot.y);
    }
  });

  ctx.fillStyle = "rgba(132, 230, 217, 0.18)";
  roundedRect(scene.friendZone.x, scene.friendZone.y, scene.friendZone.w, scene.friendZone.h, 18);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff7e0";
  ctx.font = '700 14px "Avenir Next", sans-serif';
  ctx.fillText(
    "Friends",
    scene.friendZone.x + scene.friendZone.w / 2,
    scene.friendZone.y - 10
  );

  ctx.fillStyle = "#f4d8aa";
  ctx.beginPath();
  ctx.arc(scene.yashoda.x, 34, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ad704e";
  roundedRect(scene.yashoda.x - 16, 48, 32, 36, 10);
  ctx.fill();

  drawHero(scene.player, { aura: scene.collected >= 3 });

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(11, 27, 45, 0.22)";
  roundedRect(34, 30, 220, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#ffb463";
  roundedRect(34, 30, 220 * clamp(scene.detected / 1.4, 0, 1), 18, 9);
  ctx.fill();
}

function updateKaliyaBoss(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 11;

  scene.nodes.forEach((node) => {
    if (!node.active) {
      return;
    }
    node.angle += node.speed * dt;
    node.x = scene.boss.x + Math.cos(node.angle) * node.orbit;
    node.y = scene.boss.y + Math.sin(node.angle) * node.orbit;
  });

  scene.boss.spitCooldown -= dt;
  if (scene.boss.spitCooldown <= 0) {
    const angle = Math.atan2(scene.player.y - scene.boss.y, scene.player.x - scene.boss.x);
    scene.projectiles.push({
      x: scene.boss.x,
      y: scene.boss.y + 20,
      vx: Math.cos(angle) * 170,
      vy: Math.sin(angle) * 170,
      r: 10,
    });
    scene.boss.spitCooldown = scene.nodes.some((node) => node.active) ? 1.05 : 0.82;
  }

  for (let index = scene.projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = scene.projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectile.x < -30 || projectile.x > WIDTH + 30 || projectile.y > HEIGHT + 30) {
      scene.projectiles.splice(index, 1);
      continue;
    }

    if (dist(scene.player.x, scene.player.y, projectile.x, projectile.y) < scene.player.r + projectile.r) {
      scene.projectiles.splice(index, 1);
      hurtPlayer(scene, 1, "Kaliya’s poison overcame Krishna before the serpent could be subdued.");
    }
  }

  if (tryAttack(scene.player, pressed)) {
    let struck = false;

    scene.nodes.forEach((node) => {
      if (node.active && dist(scene.player.x, scene.player.y, node.x, node.y) < 74) {
        node.active = false;
        struck = true;
        scene.score += 45;
        spawnParticles(node.x, node.y, "#84e6d9", 14, 160);
      }
    });

    if (
      !scene.nodes.some((node) => node.active) &&
      dist(scene.player.x, scene.player.y, scene.boss.x, scene.boss.y) < 92
    ) {
      scene.boss.health -= 1;
      struck = true;
      scene.score += 90;
      spawnParticles(scene.boss.x, scene.boss.y, "#ffe5a1", 18, 180);

      if (scene.boss.health <= 0) {
        completeAct("Krishna dances upon Kaliya and purifies the Yamuna.", 190);
        return;
      }
    }

    if (!struck) {
      spawnParticles(scene.player.x + scene.player.faceX * 24, scene.player.y + scene.player.faceY * 24, "#7fb6ff", 8, 120);
    }
  }
}

function drawKaliyaBoss(scene) {
  drawStoryBackdrop({ top: "#081529", mid: "#14375c", bottom: "#246383" });

  ctx.fillStyle = "rgba(89, 210, 226, 0.34)";
  ctx.beginPath();
  ctx.moveTo(0, 280);
  for (let x = 0; x <= WIDTH; x += 36) {
    ctx.lineTo(x, 282 + Math.sin(x * 0.02 + state.globalTime * 1.8) * 7);
  }
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(20, 46, 66, 0.88)";
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.moveTo(170, 410);
  ctx.bezierCurveTo(250, 290, 350, 430, 430, 332);
  ctx.bezierCurveTo(510, 250, 610, 402, 720, 318);
  ctx.stroke();

  ctx.fillStyle = "#17344f";
  ctx.beginPath();
  ctx.ellipse(scene.boss.x, scene.boss.y, 62, 72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#84e6d9";
  ctx.beginPath();
  ctx.arc(scene.boss.x - 16, scene.boss.y - 10, 4, 0, Math.PI * 2);
  ctx.arc(scene.boss.x + 16, scene.boss.y - 10, 4, 0, Math.PI * 2);
  ctx.fill();

  scene.nodes.forEach((node) => {
    if (!node.active) {
      return;
    }
    ctx.fillStyle = "#84e6d9";
    ctx.beginPath();
    ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
    ctx.fill();
  });

  scene.projectiles.forEach((projectile) => {
    ctx.fillStyle = "#a2ff8c";
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
    ctx.fill();
  });

  drawHero(scene.player, { aura: !scene.nodes.some((node) => node.active) });

  ctx.fillStyle = "rgba(8, 21, 42, 0.36)";
  roundedRect(34, 30, 240, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#84e6d9";
  roundedRect(34, 30, 240 * (scene.boss.health / scene.boss.maxHealth), 18, 9);
  ctx.fill();
}

function updateGovardhanRescue(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 10;
  scene.timer = Math.max(0, scene.timer - dt);

  if (scene.timer <= 0) {
    failAct("The storm outlasted the sheltering effort beneath Govardhan.");
    return;
  }

  if (actionPressed(pressed) && scene.player.actionCooldown === 0) {
    scene.player.actionCooldown = 2.3;
    scene.callTimer = 0.9;
    spawnParticles(scene.player.x, scene.player.y, "#ffe3a0", 18, 180);
    scene.npcs.forEach((npc) => {
      if (!npc.rescued && dist(scene.player.x, scene.player.y, npc.x, npc.y) < 130) {
        npc.following = true;
      }
    });
  }

  scene.callTimer = Math.max(0, scene.callTimer - dt);

  scene.rain.forEach((drop) => {
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    if (drop.y > HEIGHT + 20 || drop.x < -20) {
      drop.x = WIDTH + randomRange(20, 220);
      drop.y = randomRange(-260, -20);
    }

    if (dist(scene.player.x, scene.player.y, drop.x, drop.y) < scene.player.r + 7) {
      drop.x = WIDTH + randomRange(20, 220);
      drop.y = randomRange(-260, -20);
      hurtPlayer(scene, 1, "Krishna could not hold the shelter long enough to save everyone.");
    }
  });

  scene.npcs.forEach((npc, index) => {
    if (npc.rescued) {
      return;
    }

    if (dist(scene.player.x, scene.player.y, npc.x, npc.y) < 44) {
      npc.following = true;
    }

    if (npc.following) {
      const angle = index * 0.9;
      const targetX = scene.player.x + Math.cos(angle) * 38;
      const targetY = scene.player.y + Math.sin(angle) * 24 + 36;
      npc.x = lerp(npc.x, targetX, 0.06);
      npc.y = lerp(npc.y, targetY, 0.06);
    }

    if (rectHit(scene.shelter, npc.x, npc.y, 14)) {
      npc.rescued = true;
      npc.following = false;
      scene.rescued += 1;
      scene.score += 60;
      spawnParticles(npc.x, npc.y, "#84e6d9", 12, 150);
    }
  });

  if (scene.rescued >= scene.npcs.length) {
    completeAct("Krishna shelters the people and cows beneath Govardhan Hill.", 190);
  }
}

function drawGovardhanRescue(scene) {
  drawStoryBackdrop({ top: "#101c37", mid: "#243e67", bottom: "#355764" });

  for (let rain = 0; rain < 70; rain += 1) {
    const x = (rain * 37 + state.globalTime * 220) % (WIDTH + 60) - 30;
    const y = (rain * 19 + state.globalTime * 280) % HEIGHT;
    ctx.strokeStyle = "rgba(186, 219, 255, 0.24)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + 18);
    ctx.stroke();
  }

  const ground = ctx.createLinearGradient(0, 392, 0, HEIGHT);
  ground.addColorStop(0, "#639258");
  ground.addColorStop(1, "#1c4029");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 392, WIDTH, HEIGHT - 392);

  ctx.fillStyle = "rgba(34, 70, 48, 0.92)";
  ctx.beginPath();
  ctx.moveTo(scene.shelter.x, scene.shelter.y + scene.shelter.h);
  ctx.quadraticCurveTo(
    scene.shelter.x + scene.shelter.w / 2,
    160,
    scene.shelter.x + scene.shelter.w,
    scene.shelter.y + scene.shelter.h
  );
  ctx.lineTo(scene.shelter.x + scene.shelter.w - 30, scene.shelter.y + scene.shelter.h + 28);
  ctx.quadraticCurveTo(
    scene.shelter.x + scene.shelter.w / 2,
    260,
    scene.shelter.x + 30,
    scene.shelter.y + scene.shelter.h + 28
  );
  ctx.closePath();
  ctx.fill();

  if (scene.callTimer > 0) {
    ctx.strokeStyle = "rgba(255, 228, 156, 0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(scene.player.x, scene.player.y, 90 + Math.sin(state.globalTime * 8) * 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  scene.rain.forEach((drop) => {
    ctx.strokeStyle = "rgba(190, 220, 255, 0.42)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 8, drop.y + 18);
    ctx.stroke();
  });

  scene.npcs.forEach((npc) => {
    if (npc.rescued) {
      return;
    }
    if (npc.type === "cow") {
      drawCow(npc.x, npc.y, 0.92);
    } else {
      drawVillager(npc.x, npc.y, 0.95);
    }
  });

  drawHero(scene.player, { armRaised: true, aura: scene.callTimer > 0 });

  ctx.fillStyle = "#fff7e0";
  ctx.font = '700 16px "Avenir Next", sans-serif';
  ctx.fillText(`Time ${scene.timer.toFixed(0)}s`, 34, 40);
}

function spawnArenaPhase(scene) {
  scene.enemies = [];
  scene.projectiles = [];

  if (scene.phase === 0) {
    scene.enemies.push({
      x: 480,
      y: 150,
      r: 28,
      type: "elephant",
      color: "#9aa8bd",
      health: 4,
      maxHealth: 4,
      ai: "charge",
      chargeTimer: 0,
      cooldown: 0.8,
      speed: 110,
    });
  } else if (scene.phase === 1) {
    scene.enemies.push(
      {
        x: 360,
        y: 170,
        r: 24,
        type: "wrestler",
        color: "#f2b173",
        health: 3,
        maxHealth: 3,
        ai: "chase",
        cooldown: 0,
        speed: 94,
      },
      {
        x: 600,
        y: 170,
        r: 24,
        type: "wrestler",
        color: "#d58d63",
        health: 3,
        maxHealth: 3,
        ai: "chase",
        cooldown: 0,
        speed: 94,
      }
    );
  } else {
    scene.enemies.push({
      x: 480,
      y: 160,
      r: 26,
      type: "king",
      color: "#ffbe74",
      health: 7,
      maxHealth: 7,
      ai: "king",
      cooldown: 0.6,
      speed: 104,
    });
  }
}

function updateArenaBattle(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 12;

  if (tryAttack(scene.player, pressed)) {
    let struck = false;
    for (let index = scene.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = scene.enemies[index];
      if (dist(scene.player.x, scene.player.y, enemy.x, enemy.y) < scene.player.r + enemy.r + 30) {
        enemy.health -= 1;
        struck = true;
        spawnParticles(enemy.x, enemy.y, "#ffe5a1", 16, 180);
        scene.score += 40;
        if (enemy.health <= 0) {
          scene.enemies.splice(index, 1);
          scene.score += 100;
        }
      }
    }
    if (!struck) {
      spawnParticles(scene.player.x + scene.player.faceX * 26, scene.player.y + scene.player.faceY * 26, "#7fb6ff", 8, 120);
    }
  }

  scene.enemies.forEach((enemy) => {
    if (enemy.ai === "charge") {
      enemy.cooldown -= dt;
      if (enemy.chargeTimer > 0) {
        enemy.chargeTimer -= dt;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
      } else if (enemy.cooldown <= 0) {
        const angle = Math.atan2(scene.player.y - enemy.y, scene.player.x - enemy.x);
        enemy.vx = Math.cos(angle) * 280;
        enemy.vy = Math.sin(angle) * 280;
        enemy.chargeTimer = 0.65;
        enemy.cooldown = 1.4;
      } else {
        const angle = Math.atan2(scene.player.y - enemy.y, scene.player.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed * dt;
        enemy.y += Math.sin(angle) * enemy.speed * dt;
      }
    } else if (enemy.ai === "chase") {
      const angle = Math.atan2(scene.player.y - enemy.y, scene.player.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt;
      enemy.y += Math.sin(angle) * enemy.speed * dt;
    } else if (enemy.ai === "king") {
      enemy.cooldown -= dt;
      const angle = Math.atan2(scene.player.y - enemy.y, scene.player.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt;
      enemy.y += Math.sin(angle) * enemy.speed * dt;
      if (enemy.cooldown <= 0) {
        scene.projectiles.push(
          {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * 180,
            vy: Math.sin(angle) * 180,
            r: 10,
          },
          {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle + 0.35) * 160,
            vy: Math.sin(angle + 0.35) * 160,
            r: 10,
          },
          {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle - 0.35) * 160,
            vy: Math.sin(angle - 0.35) * 160,
            r: 10,
          }
        );
        enemy.cooldown = 1.3;
      }
    }

    enemy.x = clamp(enemy.x, scene.bounds.left + enemy.r, scene.bounds.right - enemy.r);
    enemy.y = clamp(enemy.y, scene.bounds.top + enemy.r, scene.bounds.bottom - enemy.r);

    if (dist(scene.player.x, scene.player.y, enemy.x, enemy.y) < scene.player.r + enemy.r + 2) {
      hurtPlayer(scene, 1, "Krishna was overwhelmed in the Mathura arena.");
    }
  });

  for (let index = scene.projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = scene.projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectile.x < -30 || projectile.x > WIDTH + 30 || projectile.y < -30 || projectile.y > HEIGHT + 30) {
      scene.projectiles.splice(index, 1);
      continue;
    }

    if (dist(scene.player.x, scene.player.y, projectile.x, projectile.y) < scene.player.r + projectile.r) {
      scene.projectiles.splice(index, 1);
      hurtPlayer(scene, 1, "Krishna was overwhelmed in the Mathura arena.");
    }
  }

  if (scene.enemies.length === 0) {
    if (scene.phase >= 2) {
      completeAct("Kuvalayapida, the wrestlers, and Kamsa all fall in the Mathura arena.", 220);
      return;
    }

    scene.phase += 1;
    spawnArenaPhase(scene);
  }
}

function drawArenaBattle(scene) {
  drawStoryBackdrop({ top: "#1a1324", mid: "#5c2841", bottom: "#7a5a44" });

  ctx.fillStyle = "rgba(255, 240, 204, 0.12)";
  for (let pillar = 0; pillar < 7; pillar += 1) {
    const x = 48 + pillar * 132;
    ctx.fillRect(x, 286, 18, 106);
    ctx.beginPath();
    ctx.moveTo(x - 4, 286);
    ctx.lineTo(x + 9, 248);
    ctx.lineTo(x + 22, 286);
    ctx.closePath();
    ctx.fill();
  }

  const floor = ctx.createLinearGradient(0, 392, 0, HEIGHT);
  floor.addColorStop(0, "#8a6845");
  floor.addColorStop(1, "#37261a");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 392, WIDTH, HEIGHT - 392);

  ctx.strokeStyle = "rgba(255, 228, 180, 0.18)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 + 40, 160, 0, Math.PI * 2);
  ctx.stroke();

  scene.projectiles.forEach((projectile) => {
    ctx.fillStyle = "#ffb97d";
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
    ctx.fill();
  });

  scene.enemies.forEach(drawEnemy);
  drawHero(scene.player, { aura: scene.phase >= 2 });

  ctx.fillStyle = "#fff7e0";
  ctx.font = '700 16px "Avenir Next", sans-serif';
  ctx.fillText(`Phase ${scene.phase + 1} / 3`, 34, 40);
}

function updateCitadelBattle(scene, dt, pressed) {
  updatePlayerCore(scene.player, dt);
  movePlayer(scene.player, dt, scene.bounds);
  scene.score += dt * 12;

  if (scene.boss.health <= 4 && !scene.minionsSpawned) {
    scene.minionsSpawned = true;
    scene.minions.push(
      {
        x: 260,
        y: 190,
        r: 20,
        type: "wrestler",
        color: "#f2b173",
        health: 2,
        maxHealth: 2,
      },
      {
        x: 700,
        y: 190,
        r: 20,
        type: "wrestler",
        color: "#d58d63",
        health: 2,
        maxHealth: 2,
      }
    );
  }

  if (tryAttack(scene.player, pressed)) {
    let struck = false;

    scene.minions.forEach((enemy) => {
      if (enemy.health > 0 && dist(scene.player.x, scene.player.y, enemy.x, enemy.y) < scene.player.r + enemy.r + 30) {
        enemy.health -= 1;
        struck = true;
        spawnParticles(enemy.x, enemy.y, "#ffe5a1", 16, 180);
        scene.score += 40;
      }
    });

    if (dist(scene.player.x, scene.player.y, scene.boss.x, scene.boss.y) < scene.player.r + scene.boss.r + 34) {
      scene.boss.health -= 1;
      struck = true;
      scene.score += 70;
      spawnParticles(scene.boss.x, scene.boss.y, "#ffe5a1", 18, 190);
      if (scene.boss.health <= 0) {
        completeAct("Narakasura falls, and the later Dwaraka arc gives way to the final pastimes.", 230);
        return;
      }
    }

    if (!struck) {
      spawnParticles(scene.player.x + scene.player.faceX * 26, scene.player.y + scene.player.faceY * 26, "#7fb6ff", 8, 120);
    }
  }

  scene.boss.cooldown -= dt;
  const bossAngle = Math.atan2(scene.player.y - scene.boss.y, scene.player.x - scene.boss.x);
  scene.boss.x += Math.cos(bossAngle) * scene.boss.speed * dt;
  scene.boss.y += Math.sin(bossAngle) * scene.boss.speed * dt;
  scene.boss.x = clamp(scene.boss.x, scene.bounds.left + scene.boss.r, scene.bounds.right - scene.boss.r);
  scene.boss.y = clamp(scene.boss.y, scene.bounds.top + scene.boss.r, scene.bounds.bottom - scene.boss.r);

  if (scene.boss.cooldown <= 0) {
    for (let shot = 0; shot < 6; shot += 1) {
      const angle = (Math.PI * 2 * shot) / 6 + state.globalTime * 0.4;
      scene.projectiles.push({
        x: scene.boss.x,
        y: scene.boss.y,
        vx: Math.cos(angle) * 160,
        vy: Math.sin(angle) * 160,
        r: 10,
      });
    }
    scene.boss.cooldown = 1.35;
  }

  scene.minions = scene.minions.filter((enemy) => enemy.health > 0);
  scene.minions.forEach((enemy) => {
    const angle = Math.atan2(scene.player.y - enemy.y, scene.player.x - enemy.x);
    enemy.x += Math.cos(angle) * 90 * dt;
    enemy.y += Math.sin(angle) * 90 * dt;
    if (dist(scene.player.x, scene.player.y, enemy.x, enemy.y) < scene.player.r + enemy.r + 2) {
      hurtPlayer(scene, 1, "Krishna was overwhelmed before Narakasura could be defeated.");
    }
  });

  if (dist(scene.player.x, scene.player.y, scene.boss.x, scene.boss.y) < scene.player.r + scene.boss.r + 2) {
    hurtPlayer(scene, 1, "Krishna was overwhelmed before Narakasura could be defeated.");
  }

  for (let index = scene.projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = scene.projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectile.x < -30 || projectile.x > WIDTH + 30 || projectile.y < -30 || projectile.y > HEIGHT + 30) {
      scene.projectiles.splice(index, 1);
      continue;
    }

    if (dist(scene.player.x, scene.player.y, projectile.x, projectile.y) < scene.player.r + projectile.r) {
      scene.projectiles.splice(index, 1);
      hurtPlayer(scene, 1, "Krishna was overwhelmed before Narakasura could be defeated.");
    }
  }
}

function drawCitadelBattle(scene) {
  drawStoryBackdrop({ top: "#231529", mid: "#7b3b4e", bottom: "#9f7d55" });

  ctx.fillStyle = "rgba(255, 236, 198, 0.12)";
  for (let column = 0; column < 6; column += 1) {
    ctx.fillRect(72 + column * 150, 88, 18, 240);
  }

  const floor = ctx.createLinearGradient(0, 392, 0, HEIGHT);
  floor.addColorStop(0, "#8a7550");
  floor.addColorStop(1, "#32261b");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 392, WIDTH, HEIGHT - 392);

  scene.projectiles.forEach((projectile) => {
    ctx.fillStyle = "#ff9f61";
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
    ctx.fill();
  });

  scene.minions.forEach(drawEnemy);
  drawEnemy(scene.boss);
  drawHero(scene.player, { aura: scene.boss.health <= 4 });

  ctx.fillStyle = "rgba(8, 21, 42, 0.36)";
  roundedRect(34, 30, 240, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#ffcd62";
  roundedRect(34, 30, 240 * (scene.boss.health / scene.boss.maxHealth), 18, 9);
  ctx.fill();
}

const acts = [
  {
    category: "Early Pastimes",
    title: "Act I - Storm Over Yamuna",
    mission: "Reach Gokul through the storm",
    summary:
      "This act begins with the advent, the birth narrative, the crossing to Gokul, and the first joy of the village.",
    chapters: [
      "Advent of Lord Krishna",
      "Prayers for Krishna in the womb",
      "Birth of Krishna",
      "Vasudeva carries Krishna to Gokul",
      "Celebration in Gokul",
    ],
    playHint:
      "Move through the river path, avoid storm hazards, and reach the glowing gate of Gokul.",
    intro: [
      line("Narrator", "The story opens before sunrise in Mathura, as the earth waits for Krishna’s advent."),
      line("Devaki", "The prayers in my heart have become light. The child has appeared."),
      line("Vasudeva", "I must carry him through the storm to Gokul. Every step matters now."),
    ],
    outro: [
      line("Narrator", "The crossing is complete, and Gokul awakens in celebration."),
      line("Nanda's House", "The early childhood leelas now begin in the courtyards of Gokul."),
    ],
    build() {
      return {
        score: 0,
        progress: 0,
        bounds: { left: 170, top: 40, right: 790, bottom: 500 },
        goal: { x: 400, y: 44, w: 160, h: 76 },
        stones: Array.from({ length: 18 }, (_, index) => ({
          x: 260 + (index % 4) * 120 + randomRange(-18, 18),
          y: 100 + Math.floor(index / 4) * 82 + randomRange(-10, 10),
          w: 18 + (index % 3) * 8,
          h: 8 + (index % 2) * 4,
          rot: randomRange(-0.6, 0.6),
        })),
        hazards: Array.from({ length: 8 }, () => ({
          x: randomRange(190, 770),
          y: randomRange(-340, 520),
          r: randomRange(12, 18),
          phase: randomRange(0, Math.PI * 2),
          speed: randomRange(160, 240),
        })),
        player: makePlayer(480, 470, "vasudeva", 4, 176),
      };
    },
    objective(scene) {
      return `Reach Gokul gate • ${Math.round((1 - scene.progress) * 100)}% left`;
    },
    status(scene) {
      return `Vasudeva is crossing the Yamuna under storm clouds. Hearts ${scene.player.health}/${scene.player.maxHealth}.`;
    },
    update: updateStormCrossing,
    draw: drawStormCrossing,
  },
  {
    category: "Early Pastimes",
    title: "Act II - Courtyard of Gokul",
    mission: "Collect butter and slip away",
    summary:
      "Putana, Shakatasura, butter stealing, Damodara, and the Yamalarjuna trees lead into the playful early life of Krishna.",
    chapters: [
      "Killing of Putana",
      "Breaking the cart (Shakatasura)",
      "Childhood pastimes (crawling, stealing butter)",
      "Damodara Leela (Yashoda binds Krishna)",
      "Deliverance of Yamalarjuna trees",
    ],
    playHint:
      "Collect all butter pots with Action, stay out of Yashoda’s lamp beam, and return to the friends zone.",
    intro: [
      line("Narrator", "Danger has passed for the moment, and Gokul becomes the home of Krishna’s playful childhood."),
      line("Krishna", "The butter pots are hanging, my friends are waiting, and Mother Yashoda must not catch me."),
      line("Narrator", "This act folds the early childhood leelas into a living courtyard mission."),
    ],
    outro: [
      line("Narrator", "The butter mischief ends with laughter, and the boyhood pastimes of Vrindavan open wider."),
      line("Narrator", "The forests, demons, and riverbank leelas now draw Krishna beyond the courtyard walls."),
    ],
    build() {
      return {
        score: 0,
        collected: 0,
        detected: 0,
        bounds: { left: 48, top: 96, right: 912, bottom: 500 },
        friendZone: { x: 740, y: 424, w: 154, h: 70 },
        pots: [
          { x: 162, y: 180, collected: false },
          { x: 310, y: 142, collected: false },
          { x: 480, y: 190, collected: false },
          { x: 640, y: 144, collected: false },
          { x: 804, y: 186, collected: false },
        ],
        yashoda: { x: 250, min: 200, max: 760, dir: 1, speed: 132 },
        player: makePlayer(148, 458, "krishna", 3, 188),
      };
    },
    objective(scene) {
      return scene.collected < scene.pots.length
        ? `Collect butter ${scene.collected}/${scene.pots.length}`
        : "Return to the friends zone";
    },
    status(scene) {
      return `Butter pots collected ${scene.collected}/${scene.pots.length}. Lamp alert ${Math.round((scene.detected / 1.4) * 100)}%.`;
    },
    update: updateMakhanCourtyard,
    draw: drawMakhanCourtyard,
  },
  {
    category: "Boyhood Pastimes",
    title: "Act III - Serpent Lake",
    mission: "Subdue Kaliya and cleanse the Yamuna",
    summary:
      "The boyhood forests bring Vatsasura, Bakasura, Aghasura, Brahma’s bewilderment, Dhenukasura, Kaliya, the forest fire, and Pralambasura.",
    chapters: [
      "Killing of Vatsasura and Bakasura",
      "Killing of Aghasura",
      "Brahma steals the cowherd boys",
      "Return of Brahma and prayers",
      "Killing of Dhenukasura",
      "Subduing Kaliya serpent",
      "Forest fire pastime",
      "Killing of Pralambasura",
    ],
    playHint:
      "Destroy the venom nodes first, then strike Kaliya directly when the shield is gone.",
    intro: [
      line("Narrator", "The forests of Vrindavan become wilder, filled with danger, wonder, and the growing strength of Krishna’s boyhood leelas."),
      line("Cowherd Boys", "The Yamuna is poisoned. Kaliya waits in the dark water."),
      line("Krishna", "Then I will enter the river and make it pure again."),
    ],
    outro: [
      line("Narrator", "The serpent is subdued, and Vrindavan turns toward Govardhan, the gopis, and the rasa leelas."),
      line("Narrator", "The next act moves from protection into devotion and divine love."),
    ],
    build() {
      return {
        score: 0,
        bounds: { left: 60, top: 80, right: 900, bottom: 498 },
        player: makePlayer(480, 446, "krishna", 4, 190),
        boss: { x: 480, y: 168, health: 5, maxHealth: 5, spitCooldown: 1.1, r: 54 },
        nodes: Array.from({ length: 4 }, (_, index) => ({
          angle: (Math.PI * 2 * index) / 4,
          orbit: 86,
          speed: 1.3 + index * 0.15,
          active: true,
          x: 0,
          y: 0,
        })),
        projectiles: [],
      };
    },
    objective(scene) {
      const activeNodes = scene.nodes.filter((node) => node.active).length;
      return activeNodes > 0
        ? `Destroy venom nodes ${4 - activeNodes}/4`
        : `Strike Kaliya ${scene.boss.maxHealth - scene.boss.health}/${scene.boss.maxHealth}`;
    },
    status(scene) {
      const activeNodes = scene.nodes.filter((node) => node.active).length;
      return activeNodes > 0
        ? `Poison nodes still active: ${activeNodes}. Break the shield around Kaliya first.`
        : `Kaliya is exposed. Attack while avoiding poison bolts.`;
    },
    update: updateKaliyaBoss,
    draw: drawKaliyaBoss,
  },
  {
    category: "Rasa Leela",
    title: "Act IV - Shelter of Govardhan",
    mission: "Rescue villagers and cows beneath the hill",
    summary:
      "Govardhan, Indra’s worship, the gopis, Katyayani vrata, the clothing pastime, the rasa beginning, separation, Gopi Geet, and reunion all shape this act.",
    chapters: [
      "Lifting Govardhan Hill",
      "Indra’s defeat and worship of Krishna",
      "Gopis’ attraction to Krishna",
      "Gopis’ vow (Katyayani vrata)",
      "Stealing the gopis’ clothes",
      "Beginning of Rasa Leela",
      "Disappearance of Krishna",
      "Gopis’ search and songs (Gopi Geet)",
      "Reunion and Rasa dance",
    ],
    playHint:
      "Touch villagers or cows to guide them. Use Action to call nearby followers into your sheltering aura.",
    intro: [
      line("Narrator", "Vrindavan turns toward Govardhan, devotion, and the deep moods of the rasa leelas."),
      line("Villagers", "The storm is too strong. Protect us, Krishna."),
      line("Krishna", "Come beneath the hill. No one will be abandoned."),
    ],
    outro: [
      line("Narrator", "The storm gives way to worship, longing, song, and reunion beneath the moon of Vrindavan."),
      line("Narrator", "From here the road turns toward Aristasura, Keshi, and the journey to Mathura."),
    ],
    build() {
      return {
        score: 0,
        timer: 75,
        rescued: 0,
        callTimer: 0,
        bounds: { left: 48, top: 90, right: 912, bottom: 500 },
        shelter: { x: 302, y: 246, w: 356, h: 126 },
        player: makePlayer(480, 452, "krishna", 4, 188),
        npcs: [
          { x: 138, y: 430, type: "villager", following: false, rescued: false },
          { x: 256, y: 466, type: "cow", following: false, rescued: false },
          { x: 800, y: 432, type: "villager", following: false, rescued: false },
          { x: 704, y: 470, type: "cow", following: false, rescued: false },
          { x: 132, y: 208, type: "villager", following: false, rescued: false },
          { x: 816, y: 214, type: "villager", following: false, rescued: false },
          { x: 242, y: 156, type: "cow", following: false, rescued: false },
          { x: 706, y: 150, type: "cow", following: false, rescued: false },
        ],
        rain: Array.from({ length: 10 }, () => ({
          x: randomRange(40, WIDTH + 180),
          y: randomRange(-360, 520),
          vx: -72,
          vy: 210,
        })),
      };
    },
    objective(scene) {
      return `Rescue ${scene.rescued}/${scene.npcs.length} before ${scene.timer.toFixed(0)}s`;
    },
    status(scene) {
      return `Villagers and cows sheltered ${scene.rescued}/${scene.npcs.length}. Time left ${scene.timer.toFixed(0)} seconds.`;
    },
    update: updateGovardhanRescue,
    draw: drawGovardhanRescue,
  },
  {
    category: "Mathura Leela",
    title: "Act V - The Mathura Arena",
    mission: "Defeat the arena phases and bring down Kamsa",
    summary:
      "Aristasura, Keshi, Akrura’s visit, the departure to Mathura, Kuvalayapida, the wrestlers, and Kamsa drive the story into the arena.",
    chapters: [
      "Killing of Aristasura",
      "Killing of Keshi demon",
      "Akrura visits Vrindavan",
      "Krishna leaves for Mathura",
      "Killing of Kuvalayapida elephant",
      "Wrestling match in Mathura",
      "Killing of Kamsa",
    ],
    playHint:
      "Use melee attacks at close range and keep moving between elephant charges, wrestlers, and Kamsa’s projectiles.",
    intro: [
      line("Narrator", "Vrindavan gives way to the road to Mathura, where the final city battle waits."),
      line("Akrura", "The summons has come. Mathura cannot be avoided."),
      line("Krishna", "Then let the arena open. Kamsa’s fear ends today."),
    ],
    outro: [
      line("Narrator", "The arena falls silent. Kuvalayapida, the wrestlers, and Kamsa are all defeated."),
      line("Narrator", "The later royal pastimes now turn the story toward Dwaraka and its final arc."),
    ],
    build() {
      const scene = {
        score: 0,
        phase: 0,
        bounds: { left: 60, top: 100, right: 900, bottom: 500 },
        player: makePlayer(480, 444, "krishna", 5, 192),
        enemies: [],
        projectiles: [],
      };
      spawnArenaPhase(scene);
      return scene;
    },
    objective(scene) {
      return `Arena phase ${scene.phase + 1}/3`;
    },
    status(scene) {
      const labels = ["Kuvalayapida", "The wrestlers", "Kamsa"];
      return `Current foe: ${labels[scene.phase]}. Stay mobile and attack at close range.`;
    },
    update: updateArenaBattle,
    draw: drawArenaBattle,
  },
  {
    category: "Dwaraka and Final Pastimes",
    title: "Act VI - Dwaraka and the Last Arc",
    mission: "Defeat Narakasura and reach the ending",
    summary:
      "The Dwaraka chapters, royal pastimes, Narakasura, Mausala Leela, and the Departure of Krishna close the story mode journey.",
    chapters: [
      "Krishna in Dwaraka",
      "Marriage with Rukmini",
      "Syamantaka jewel story",
      "Narakasura killed",
      "More marriages and pastimes",
      "Various royal activities",
      "Mausala Leela (end of Yadu dynasty)",
      "Departure of Krishna",
    ],
    playHint:
      "Strike Narakasura in close range, survive the radial attacks, and clear the last battle before the epilogue.",
    intro: [
      line("Narrator", "The city of Dwaraka rises, royal pastimes unfold, and one more great battle still remains."),
      line("Narrator", "Beyond it waits the quieter final arc of Krishna’s earthly departure."),
      line("Krishna", "Then let the last battle yield, and the story move toward its final peace."),
    ],
    outro: [
      line("Narrator", "Dwaraka’s victories and royal leelas settle into memory."),
      line("Narrator", "Mausala Leela and the Departure of Krishna close the earthly story, but never the devotion it awakened."),
    ],
    build() {
      return {
        score: 0,
        minionsSpawned: false,
        bounds: { left: 60, top: 100, right: 900, bottom: 500 },
        player: makePlayer(480, 444, "krishna", 5, 190),
        boss: {
          x: 480,
          y: 170,
          r: 30,
          type: "king",
          color: "#ff9f61",
          health: 8,
          maxHealth: 8,
          cooldown: 1,
          speed: 94,
        },
        minions: [],
        projectiles: [],
      };
    },
    objective(scene) {
      return `Narakasura ${scene.boss.health}/${scene.boss.maxHealth}`;
    },
    status(scene) {
      return scene.minionsSpawned
        ? "Narakasura is wounded and has called defenders. Finish the final battle."
        : "Press the attack before Narakasura fills the arena with fire.";
    },
    update: updateCitadelBattle,
    draw: drawCitadelBattle,
  },
];

const state = {
  mode: "menu",
  actIndex: 0,
  actState: null,
  dialogueKind: "intro",
  dialogueIndex: 0,
  resultText: "",
  failureText: "",
  blessings: 0,
  best: readBestScore(),
  particles: [],
  globalTime: 0,
};

function drawScene() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  if (state.mode === "menu" || !state.actState) {
    drawMenuScene();
  } else {
    acts[state.actIndex].draw(state.actState);
  }

  drawParticles();
}

let lastFrame = performance.now();

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.032);
  lastFrame = now;

  state.globalTime += dt;
  updateParticles(dt);

  if (state.mode === "play" && state.actState) {
    const pressed = consumePressed();
    acts[state.actIndex].update(state.actState, dt, pressed);
    updatePanels();
  } else {
    consumePressed();
  }

  drawScene();
  requestAnimationFrame(loop);
}

function triggerPrimary() {
  if (state.mode === "play") {
    return;
  }

  advanceDialogue();
}

function triggerSecondary() {
  if (state.mode === "play") {
    retryAct();
    return;
  }

  if (state.mode === "failed") {
    restartStory();
  }
}

function handleKey(event, isDown) {
  const keyMap = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowUp: "up",
    KeyW: "up",
    ArrowRight: "right",
    KeyD: "right",
    ArrowDown: "down",
    KeyS: "down",
    Space: "action",
    Enter: "action",
    KeyF: "action",
    KeyE: "action",
  };

  const control = keyMap[event.code];
  if (!control) {
    return;
  }

  event.preventDefault();
  setControl(control, isDown);

  if (!isDown && control === "action" && state.mode !== "play") {
    triggerPrimary();
  }
}

document.addEventListener("keydown", (event) => handleKey(event, true));
document.addEventListener("keyup", (event) => handleKey(event, false));

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setControl(control, true);
    if (control === "action" && state.mode !== "play") {
      triggerPrimary();
    }
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach((type) => {
    button.addEventListener(type, (event) => {
      event.preventDefault();
      setControl(control, false);
    });
  });
});

primaryButton.addEventListener("click", triggerPrimary);
secondaryButton.addEventListener("click", triggerSecondary);

renderTimeline();
updatePanels();
requestAnimationFrame(loop);
