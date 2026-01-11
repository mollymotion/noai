const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const BASE_W = 800;
const BASE_H = 450;

// Enemy art base (source is 62x80, enemies always smaller)
const ENEMY_BASE_W = 62 * 0.7;
const ENEMY_BASE_H = 80 * 0.7;

// Player HP
const MAX_HP = 4;
const IFRAME_SECONDS = 1.0;
const HEAL_FLASH_SECONDS = 0.35;

// Heart pickup
const HEART_SPAWN_CHANCE = 0.03;
const HEART_BASE_W = 18;
const HEART_BASE_H = 16;

ctx.imageSmoothingEnabled = false;

// Images
const playerImage = new Image();
playerImage.src = "artist.png";

const playerShootImage = new Image();
playerShootImage.src = "artist2.png";

const enemyImage = new Image();
enemyImage.src = "enemy-brain4.png";

const bulletImage = new Image();
bulletImage.src = "bullet.png";

// Input
const keys = new Set();
let canShoot = true;
let spaceHeld = false;

// Mobile detection
const isTouchDevice =
  matchMedia("(hover: none), (pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0;

// Drag state
let dragActive = false;
let dragPointerId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Canvas rect for pointer mapping
let canvasRect = null;
function updateCanvasRect() {
  canvasRect = canvas.getBoundingClientRect();
}
window.addEventListener("resize", updateCanvasRect);

// Keyboard controls (desktop)
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

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

// Resize canvas
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
const pickups = [];

let lastTime = performance.now();
let spawnTimer = 0;
let score = 0;
let alive = true;

let hp = MAX_HP;
let iFrameTimer = 0;
let healFlashTimer = 0;

// Restart button
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
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Reset
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
  healFlashTimer = 0;

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

// Pointer helpers
function pointerToGameXY(clientX, clientY) {
  const x = ((clientX - canvasRect.left) / canvasRect.width) * BASE_W;
  const y = ((clientY - canvasRect.top) / canvasRect.height) * BASE_H;
  return { x, y };
}

function isPointInPlayer(px, py) {
  return px >= player.x && px <= player.x + player.w && py >= player.y && py <= player.y + player.h;
}

// Mobile drag + tap
function startPointer(e) {
  if (!alive || e.pointerType === "mouse") return;

  const { x, y } = pointerToGameXY(e.clientX, e.clientY);

  if (isPointInPlayer(x, y)) {
    dragActive = true;
    dragPointerId = e.pointerId;
    dragOffsetX = x - player.x;
    dragOffsetY = y - player.y;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else {
    if (canShoot) {
      shootBullet();
      canShoot = false;
    }
    spaceHeld = true;
    e.preventDefault();
  }
}

function movePointer(e) {
  if (!dragActive || e.pointerId !== dragPointerId) return;
  const { x, y } = pointerToGameXY(e.clientX, e.clientY);
  player.x = clamp(x - dragOffsetX, 0, BASE_W - player.w);
  player.y = clamp(y - dragOffsetY, 0, BASE_H - player.h);
  e.preventDefault();
}

function endPointer(e) {
  if (e.pointerId === dragPointerId) {
    dragActive = false;
    dragPointerId = null;
  }
  spaceHeld = false;
  canShoot = true;
}

if (isTouchDevice) {
  canvas.addEventListener("pointerdown", startPointer, { passive: false });
  canvas.addEventListener("pointermove", movePointer, { passive: false });
  canvas.addEventListener("pointerup", endPointer, { passive: false });
  canvas.addEventListener("pointercancel", endPointer, { passive: false });
}

// Damage
function takeHit(enemyIndex) {
  if (iFrameTimer > 0) return;

  hp--;
  iFrameTimer = IFRAME_SECONDS;
  enemies.splice(enemyIndex, 1);

  if (hp <= 0) {
    alive = false;
    restartBtn.style.display = "block";
  }
}

// Draw heart
function drawHeart(x, y, w, h) {
  const cx = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y + h);
  ctx.bezierCurveTo(x, y + h * 0.7, x, y + h * 0.35, cx, y + h * 0.35);
  ctx.bezierCurveTo(x + w, y + h * 0.35, x + w, y + h * 0.7, cx, y + h);
  ctx.fillStyle = "#ff4d6d";
  ctx.fill();
}

// Update loop
function update(dt) {
  if (!alive) return;

  if (iFrameTimer > 0) iFrameTimer -= dt;
  if (healFlashTimer > 0) healFlashTimer -= dt;

  // Desktop movement
  if (!isTouchDevice) {
    const up = keys.has("w") || keys.has("arrowup");
    const down = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");

    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;

    player.x = clamp(player.x + vx * player.speed * dt, 0, BASE_W - player.w);
    player.y = clamp(player.y + vy * player.speed * dt, 0, BASE_H - player.h);
  }

  // Bullets
  bullets.forEach((b) => (b.x += b.speed * dt));
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].x > BASE_W) bullets.splice(i, 1);
  }

  // Spawn enemies + hearts
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const scale = 0.6 + Math.random() * 0.15;
    const w = ENEMY_BASE_W * scale;
    const h = ENEMY_BASE_H * scale;
    const speed = 120 + Math.random() * 160;

    enemies.push({
      x: BASE_W + 20,
      y: Math.random() * (BASE_H - h),
      w,
      h,
      speed,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
    });

    if (Math.random() < HEART_SPAWN_CHANCE) {
      pickups.push({
        x: BASE_W + 40,
        y: Math.random() * (BASE_H - HEART_BASE_H),
        w: HEART_BASE_W,
        h: HEART_BASE_H,
        speed: speed * 0.95,
        phase: Math.random() * Math.PI * 2,
      });
    }

    spawnTimer = 0.65;
  }

  enemies.forEach((e) => {
    e.x -= e.speed * dt;
    e.phaseX += dt * 6;
    e.phaseY += dt * 6;
  });

  pickups.forEach((p) => {
    p.x -= p.speed * dt;
    p.phase += dt * 6;
  });

  // Bullet vs enemy
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      if (aabb(enemies[ei], bullets[bi])) {
        enemies.splice(ei, 1);
        bullets.splice(bi, 1);
        score += 10;
        break;
      }
    }
  }

  // Player vs heart
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (aabb(player, pickups[i])) {
      if (hp < MAX_HP) {
        hp++;
        healFlashTimer = HEAL_FLASH_SECONDS;
      }
      pickups.splice(i, 1);
    }
  }

  // Player vs enemy
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (aabb(player, enemies[i])) {
      takeHit(i);
      break;
    }
  }
}

// Draw
function draw() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  const flicker = iFrameTimer > 0 && Math.floor(iFrameTimer * 20) % 2 === 0;

  if (!flicker) {
    const img = spaceHeld ? playerShootImage : playerImage;
    if (healFlashTimer > 0) {
      ctx.drawImage(img, player.x, player.y, player.w, player.h);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.drawImage(img, player.x, player.y, player.w, player.h);
    }
  }

  bullets.forEach((b) => ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h));

  pickups.forEach((p) => drawHeart(p.x, p.y, p.w, p.h));

  enemies.forEach((e) => {
    const sx = 1 + Math.sin(e.phaseX) * 0.06;
    const sy = 1 + Math.sin(e.phaseY) * 0.06;
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.scale(sx, sy);
    ctx.drawImage(enemyImage, -e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();
  });

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 24);

  const hearts = "♥".repeat(hp) + "♡".repeat(MAX_HP - hp);
  ctx.fillText(`HP: ${hearts}`, 12, 44);

  if (!alive) {
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("Game Over", BASE_W / 2 - 70, BASE_H / 2 - 40);
  }
}

// Loop
function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
