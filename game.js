const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const BASE_W = 800;
const BASE_H = 450;

// Enemy art is 62x80; make all enemies smaller + uniform ratio
const ENEMY_BASE_W = 62 * 0.7; // ≈ 43
const ENEMY_BASE_H = 80 * 0.7; // ≈ 56

// Player HP
const MAX_HP = 4;
const IFRAME_SECONDS = 1.0;

// Heart pickup
const HEART_SPAWN_CHANCE = 0.03; // 3% chance per enemy spawn (rare)
const HEART_BASE_W = 18;
const HEART_BASE_H = 16;

ctx.imageSmoothingEnabled = false;

// Player images
const playerImage = new Image();
playerImage.src = "artist.png";

const playerShootImage = new Image();
playerShootImage.src = "artist2.png";

// Single enemy image
const enemyImage = new Image();
enemyImage.src = "enemy-brain4.png";

// Bullet image
const bulletImage = new Image();
bulletImage.src = "bullet.png";

// Input
const keys = new Set();
let canShoot = true;
let spaceHeld = false;

// Mobile drag state
const isTouchDevice =
  matchMedia("(hover: none), (pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0;

let dragActive = false;
let dragPointerId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Cached rect for mapping pointer -> BASE coords
let canvasRect = null;
function updateCanvasRect() {
  canvasRect = canvas.getBoundingClientRect();
}
window.addEventListener("resize", updateCanvasRect, { passive: true });

// Keyboard movement tracking (desktop)
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Single-shot space handling (desktop)
window.addEventListener(
  "keydown",
  (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      spaceHeld = true;
      if (!e.repeat && canShoot) {
        shootBullet();
        canShoot = false;
      }
    }
  },
  { passive: false }
);

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    canShoot = true;
  }
});

// Responsive canvas
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);

  canvas.style.width = `${Math.floor(BASE_W * scale)}px`;
  canvas.style.height = `${Math.floor(BASE_H * scale)}px`;

  canvas.width = Math.floor(BASE_W * dpr);
  canvas.height = Math.floor(BASE_H * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateCanvasRect();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Game state
const player = { x: 60, y: 200, w: 62, h: 62, speed: 260 };
const bullets = [];
const enemies = [];
const pickups = []; // hearts

let lastTime = performance.now();
let spawnTimer = 0;
let score = 0;
let alive = true;

let hp = MAX_HP;
let iFrameTimer = 0;

// --- Restart button (DOM overlay) ---
const restartBtn = document.createElement("button");
restartBtn.textContent = "Restart";
restartBtn.style.position = "absolute";
restartBtn.style.left = "50%";
restartBtn.style.top = "50%";
restartBtn.style.transform = "translate(-50%, -50%)";
restartBtn.style.padding = "14px 22px";
restartBtn.style.font = "700 18px system-ui, sans-serif";
restartBtn.style.borderRadius = "14px";
restartBtn.style.border = "1px solid rgba(255,255,255,0.25)";
restartBtn.style.background = "rgba(255,255,255,0.15)";
restartBtn.style.color = "#fff";
restartBtn.style.cursor = "pointer";
restartBtn.style.display = "none";
restartBtn.style.zIndex = "20";

document.getElementById("wrap").appendChild(restartBtn);

restartBtn.addEventListener("click", () => {
  reset();
  restartBtn.style.display = "none";
});

// Helpers
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function aabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function reset() {
  bullets.length = 0;
  enemies.length = 0;
  pickups.length = 0;

  player.x = 60;
  player.y = 200;

  score = 0;
  alive = true;
  spawnTimer = 0.3;

  hp = MAX_HP;
  iFrameTimer = 0;

  canShoot = true;
  spaceHeld = false;
  keys.clear();

  dragActive = false;
  dragPointerId = null;
}

// Shooting
function shootBullet() {
  if (!alive) return;
  bullets.push({
    x: player.x + player.w - 6,
    y: player.y + (player.h - 10) / 2 + 3,
    w: 44,
    h: 10,
    speed: 420,
  });
}

// --- Mobile: drag-to-move + tap-to-shoot ---
function pointerToGameXY(clientX, clientY) {
  if (!canvasRect) updateCanvasRect();
  const x = ((clientX - canvasRect.left) / canvasRect.width) * BASE_W;
  const y = ((clientY - canvasRect.top) / canvasRect.height) * BASE_H;
  return { x, y };
}

function isPointInPlayer(px, py) {
  return (
    px >= player.x &&
    px <= player.x + player.w &&
    py >= player.y &&
    py <= player.y + player.h
  );
}

function startDragOrTapShoot(e) {
  if (!alive) return;
  if (e.pointerType === "mouse") return;

  const { x, y } = pointerToGameXY(e.clientX, e.clientY);

  // Touch player => drag
  if (isPointInPlayer(x, y)) {
    dragActive = true;
    dragPointerId = e.pointerId;
    dragOffsetX = x - player.x;
    dragOffsetY = y - player.y;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    return;
  }

  // Touch elsewhere => shoot once
  if (canShoot) {
    shootBullet();
    canShoot = false;
  }
  spaceHeld = true;
  e.preventDefault();
}

function moveDrag(e) {
  if (!dragActive) return;
  if (e.pointerId !== dragPointerId) return;

  const { x, y } = pointerToGameXY(e.clientX, e.clientY);
  player.x = clamp(x - dragOffsetX, 0, BASE_W - player.w);
  player.y = clamp(y - dragOffsetY, 0, BASE_H - player.h);

  e.preventDefault();
}

function endDragOrTap(e) {
  if (e.pointerId === dragPointerId) {
    dragActive = false;
    dragPointerId = null;
  }
  spaceHeld = false;
  canShoot = true;
}

if (isTouchDevice) {
  canvas.addEventListener("pointerdown", startDragOrTapShoot, { passive: false });
  canvas.addEventListener("pointermove", moveDrag, { passive: false });
  canvas.addEventListener("pointerup", endDragOrTap, { passive: false });
  canvas.addEventListener("pointercancel", endDragOrTap, { passive: false });
}

// Damage handling
function takeHit(removeEnemyIndex) {
  if (iFrameTimer > 0) return;

  hp -= 1;
  iFrameTimer = IFRAME_SECONDS;

  // Remove the enemy you collided with so you don't instantly get hit again
  if (typeof removeEnemyIndex === "number") {
    enemies.splice(removeEnemyIndex, 1);
  }

  if (hp <= 0) {
    alive = false;
    restartBtn.style.display = "block";
  }
}

// Heart drawing (no asset needed)
function drawHeart(x, y, w, h) {
  const cx = x + w / 2;
  const top = y + h * 0.35;
  const bottom = y + h;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, bottom);

  ctx.bezierCurveTo(x, y + h * 0.70, x, top, cx, top);
  ctx.bezierCurveTo(x + w, top, x + w, y + h * 0.70, cx, bottom);

  ctx.closePath();
  ctx.fillStyle = "#ff4d6d"; // tiny heart color
  ctx.fill();
  ctx.restore();
}

function update(dt) {
  if (!alive) return;

  // i-frames timer
  if (iFrameTimer > 0) iFrameTimer = Math.max(0, iFrameTimer - dt);

  // Desktop movement (mobile uses drag)
  if (!isTouchDevice) {
    const up = keys.has("w") || keys.has("arrowup");
    const down = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");

    let vx = 0,
      vy = 0;
    if (up) vy -= 1;
    if (down) vy += 1;
    if (left) vx -= 1;
    if (right) vx += 1;

    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;

    player.x = clamp(player.x + vx * player.speed * dt, 0, BASE_W - player.w);
    player.y = clamp(player.y + vy * player.speed * dt, 0, BASE_H - player.h);
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].speed * dt;
    if (bullets[i].x > BASE_W) bullets.splice(i, 1);
  }

  // Spawn enemies (uniform aspect ratio; size varies slightly but ALWAYS smaller)
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const scale = 0.6 + Math.random() * 0.15; // max 0.75 of base => always smaller

    const w = ENEMY_BASE_W * scale;
    const h = ENEMY_BASE_H * scale;

    const enemySpeed = 120 + Math.random() * 160;

    enemies.push({
      x: BASE_W + 20,
      y: Math.random() * (BASE_H - h),
      w,
      h,
      speed: enemySpeed,
      img: enemyImage,

      wiggleXSpeed: 4 + Math.random() * 3,
      wiggleYSpeed: 4 + Math.random() * 3,
      wiggleXAmount: 0.06 + Math.random() * 0.04,
      wiggleYAmount: 0.06 + Math.random() * 0.04,
      wigglePhaseX: Math.random() * Math.PI * 2,
      wigglePhaseY: Math.random() * Math.PI * 2,
    });

    // Rare heart pickup (comes in like an enemy, but smaller)
    if (Math.random() < HEART_SPAWN_CHANCE) {
      const hw = HEART_BASE_W * (0.9 + Math.random() * 0.2);
      const hh = HEART_BASE_H * (0.9 + Math.random() * 0.2);

      pickups.push({
        type: "heart",
        x: BASE_W + 20 + 18, // slightly offset from enemy spawn
        y: Math.random() * (BASE_H - hh),
        w: hw,
        h: hh,
        speed: enemySpeed * 0.95, // roughly matches enemy pace
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        wiggleXSpeed: 5 + Math.random() * 3,
        wiggleYSpeed: 5 + Math.random() * 3,
        wiggleXAmount: 0.08 + Math.random() * 0.04,
        wiggleYAmount: 0.08 + Math.random() * 0.04,
      });
    }

    spawnTimer = 0.65;
  }

  // Enemies move + wiggle phases
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.x -= e.speed * dt;
    e.wigglePhaseX += e.wiggleXSpeed * dt;
    e.wigglePhaseY += e.wiggleYSpeed * dt;

    if (e.x + e.w < 0) enemies.splice(i, 1);
  }

  // Pickups move + wiggle phases
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x -= p.speed * dt;
    p.phaseX += p.wiggleXSpeed * dt;
    p.phaseY += p.wiggleYSpeed * dt;

    if (p.x + p.w < 0) pickups.splice(i, 1);
  }

  // Bullet-enemy collisions
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      if (aabb(enemies[ei], bullets[bi])) {
        bullets.splice(bi, 1);
        enemies.splice(ei, 1);
        score += 10;
        break;
      }
    }
  }

  // Player-pickup collisions (hearts restore 1 HP)
  for (let pi = pickups.length - 1; pi >= 0; pi--) {
    const p = pickups[pi];
    if (aabb(player, p)) {
      if (p.type === "heart") {
        hp = Math.min(MAX_HP, hp + 1);
      }
      pickups.splice(pi, 1);
    }
  }

  // Player-enemy collisions => damage instead of instant death
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    if (aabb(player, enemies[ei])) {
      takeHit(ei);
      break;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  // Flicker player during i-frames
  const flicker = iFrameTimer > 0 && Math.floor(iFrameTimer * 20) % 2 === 0;

  // Player
  if (!flicker) {
    const pImg = spaceHeld ? playerShootImage : playerImage;
    if (pImg.complete) ctx.drawImage(pImg, player.x, player.y, player.w, player.h);
  }

  // Bullets
  for (const b of bullets) {
    if (bulletImage.complete) ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h);
  }

  // Pickups (hearts)
  for (const p of pickups) {
    const sx = 1 + Math.sin(p.phaseX) * p.wiggleXAmount;
    const sy = 1 + Math.sin(p.phaseY) * p.wiggleYAmount;

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(sx, sy);
    drawHeart(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  // Enemies (wiggle)
  for (const e of enemies) {
    if (!e.img.complete) continue;

    const sx = 1 + Math.sin(e.wigglePhaseX) * e.wiggleXAmount;
    const sy = 1 + Math.sin(e.wigglePhaseY) * e.wiggleYAmount;

    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.scale(sx, sy);
    ctx.drawImage(e.img, -e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();
  }

  // UI
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 24);

  // HP as hearts
  const hearts = "♥".repeat(hp) + "♡".repeat(MAX_HP - hp);
  ctx.fillText(`HP: ${hearts}`, 12, 44);

  if (!alive) {
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("Game Over", BASE_W / 2 - 70, BASE_H / 2 - 40);
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
