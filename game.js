const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const BASE_W = 800;
const BASE_H = 450;

// Enemy sprite sheet (enemy-sprite-brain.png)
// 3 frames, 119x111 each. Sequence: 1,2,3,2, repeat.
const ENEMY_FRAME_W = 119;
const ENEMY_FRAME_H = 111;
const ENEMY_FRAME_SEQUENCE = [0, 1, 2, 1];
const ENEMY_ANIM_FPS = 6; 

// Enemy art base (source is 62x80, enemies always smaller)
const ENEMY_BASE_W = 62 * 0.7;
const ENEMY_BASE_H = 80 * 0.7;

// Player HP
const MAX_HP = 3;
const IFRAME_SECONDS = 1.0;

// Heal flash + pop
const HEART_COLOR = "#ff4d6d";
const HEAL_FLASH_MAX_ALPHA = 0.85;
const HEAL_FLASH_TOTAL_SECONDS = 0.65; // longer overall
const HEAL_FLASH_PULSE_SECONDS = 0.28; // first part: 2 quick flashes
const HEAL_POP_FRAMES = 2; // exactly 2 frames

// Heart pickup (tuned so you can actually see them)
const HEART_SPAWN_CHANCE = 0.06; // was 0.03
const HEART_BASE_W = 22;         // was 18
const HEART_BASE_H = 20;         // was 16

// Enemy spawn boundaries
const ENEMY_SPAWN_MARGIN_TOP = 40;
const ENEMY_SPAWN_MARGIN_BOTTOM = 40;

// UI margin to prevent gameplay overlap
const UI_MARGIN_TOP = 40;

ctx.imageSmoothingEnabled = false;

// Images
const playerImage = new Image();
playerImage.src = "artist.png";

const playerShootImage = new Image();
playerShootImage.src = "artist2.png";

const enemySprite = new Image();
enemySprite.src = "enemy-sprite-brain.png";

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
  const availableHeight = window.innerHeight - 250; // Reserve 250px for description area
  const scale = Math.min(window.innerWidth / BASE_W, availableHeight / BASE_H);

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

// Enemy animation state
let enemyAnimAccum = 0;
let enemyAnimStep = 0;

let lastTime = performance.now();
let spawnTimer = 0;
let score = 0;
let alive = true;

let hp = MAX_HP;
let iFrameTimer = 0;

let healFlashTimer = 0;
let healPopFrames = 0;

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
  healPopFrames = 0;

  canShoot = true;
  spaceHeld = false;
  keys.clear();

  dragActive = false;
  dragPointerId = null;

  enemyAnimAccum = 0;
  enemyAnimStep = 0;
}

// Shooting
function shootBullet() {
  if (!alive) return;
  bullets.push({
    x: player.x + player.w - 6,
    y: player.y + (player.h - 10) / 2 + 3,
    w: 44,
    h: 10,
    speed: 350,
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
  player.y = clamp(y - dragOffsetY, UI_MARGIN_TOP, BASE_H - player.h);
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
  ctx.bezierCurveTo(x, y + h * 0.7, x, y + h * 0.25, cx, y + h * 0.45);
  ctx.bezierCurveTo(x + w, y + h * 0.25, x + w, y + h * 0.7, cx, y + h);
  ctx.fillStyle = HEART_COLOR;
  ctx.fill();

  // tiny outline so it pops on black
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.stroke();
}

// Heal flash intensity
function getHealFlashAlpha() {
  if (healFlashTimer <= 0) return 0;

  const elapsed = HEAL_FLASH_TOTAL_SECONDS - healFlashTimer;

  if (elapsed <= HEAL_FLASH_PULSE_SECONDS) {
    const p = elapsed / HEAL_FLASH_PULSE_SECONDS; // 0..1
    const wave = Math.max(0, Math.sin(p * Math.PI * 4)); // 2 positive lobes
    return HEAL_FLASH_MAX_ALPHA * wave;
  }

  const tailElapsed = elapsed - HEAL_FLASH_PULSE_SECONDS;
  const tailDur = HEAL_FLASH_TOTAL_SECONDS - HEAL_FLASH_PULSE_SECONDS;
  const t = clamp(tailElapsed / tailDur, 0, 1);
  const easeOut = 1 - Math.pow(t, 2);
  return HEAL_FLASH_MAX_ALPHA * easeOut * 0.9;
}

// Player pop scale for exactly 2 frames
function getHealPopScale() {
  if (healPopFrames <= 0) return 1;
  const frameIndex = HEAL_POP_FRAMES - healPopFrames; // 0 then 1
  return frameIndex === 0 ? 1.10 : 1.06;
}

// Update loop
function update(dt) {
  if (!alive) return;

  if (iFrameTimer > 0) iFrameTimer = Math.max(0, iFrameTimer - dt);
  if (healFlashTimer > 0) healFlashTimer = Math.max(0, healFlashTimer - dt);
  if (healPopFrames > 0) healPopFrames--;

  // Enemy sprite animation (global)
  enemyAnimAccum += dt;
  const frameDur = 1 / ENEMY_ANIM_FPS;
  while (enemyAnimAccum >= frameDur) {
    enemyAnimAccum -= frameDur;
    enemyAnimStep = (enemyAnimStep + 1) % ENEMY_FRAME_SEQUENCE.length;
  }

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
    player.y = clamp(player.y + vy * player.speed * dt, UI_MARGIN_TOP, BASE_H - player.h);
  }

  // Bullets
  bullets.forEach((b) => (b.x += b.speed * dt));
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].x > BASE_W) bullets.splice(i, 1);
  }

  // Spawn enemies + hearts
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const scale = 0.4 + Math.random() * 0.15;
    // Use sprite aspect ratio (119x111) instead of base dimensions
    const w = ENEMY_FRAME_W * scale * 0.4; // scale down from sprite size
    const h = ENEMY_FRAME_H * scale * 0.4;
    const speed = 120 + Math.random() * 160;

    // Calculate safe spawn area - ensure player can reach enemies
    const minY = Math.max(ENEMY_SPAWN_MARGIN_TOP, UI_MARGIN_TOP + 30); // Add buffer for player reach
    const maxY = BASE_H - ENEMY_SPAWN_MARGIN_BOTTOM - h;
    const spawnY = minY + Math.random() * (maxY - minY);

    enemies.push({
      x: BASE_W + 20,
      y: spawnY,
      w,
      h,
      speed,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
    });

    if (Math.random() < HEART_SPAWN_CHANCE) {
      // Hearts also respect the spawn margins and UI area
      const heartMinY = Math.max(ENEMY_SPAWN_MARGIN_TOP, UI_MARGIN_TOP);
      const heartMaxY = BASE_H - ENEMY_SPAWN_MARGIN_BOTTOM - HEART_BASE_H;
      const heartSpawnY = heartMinY + Math.random() * (heartMaxY - heartMinY);

      pickups.push({
        x: BASE_W + 40,
        y: heartSpawnY,
        w: HEART_BASE_W,
        h: HEART_BASE_H,
        speed: speed * 0.95,
        phase: Math.random() * Math.PI * 2,
      });
    }

    spawnTimer = 0.65;
  }

  // Move enemies + pickups
  enemies.forEach((e) => {
    e.x -= e.speed * dt;
    e.phaseX += dt * 6;
    e.phaseY += dt * 6;
  });

  pickups.forEach((p) => {
    p.x -= p.speed * dt;
    p.phase += dt * 6;
  });

  // Cleanup offscreen enemies/pickups
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x + enemies[i].w < 0) enemies.splice(i, 1);
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (pickups[i].x + pickups[i].w < 0) pickups.splice(i, 1);
  }

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
        // Only show feedback when actually healing
        healFlashTimer = HEAL_FLASH_TOTAL_SECONDS;
        healPopFrames = HEAL_POP_FRAMES;
        hp++;
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

  // Player
  if (!flicker) {
    const img = spaceHeld ? playerShootImage : playerImage;
    const popScale = getHealPopScale();

    if (img.complete) {
      ctx.save();
      ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
      ctx.scale(popScale, popScale);
      ctx.drawImage(img, -player.w / 2, -player.h / 2, player.w, player.h);

      const alpha = getHealFlashAlpha();
      if (alpha > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = `rgba(255,77,109,${alpha})`;
        ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.restore();
    }
  }

  // Bullets
  for (const b of bullets) {
    if (bulletImage.complete) ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h);
  }

  // Pickups (hearts)
  for (const p of pickups) {
    const sx = 1 + Math.sin(p.phase) * 0.10;
    const sy = 1 + Math.cos(p.phase) * 0.10;

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(sx, sy);
    drawHeart(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  // Enemies (wiggle) — animated sprite
  for (const e of enemies) {
    const wiggle = 1 + Math.sin(e.phaseX) * 0.06;
    const sx = wiggle;
    const sy = wiggle;

    if (!enemySprite.complete) continue;

    const frame = ENEMY_FRAME_SEQUENCE[enemyAnimStep];
    const sxSrc = frame * ENEMY_FRAME_W;

    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.scale(sx, sy);
    
    ctx.drawImage(
      enemySprite,
      sxSrc,
      0,
      ENEMY_FRAME_W,
      ENEMY_FRAME_H,
      -e.w / 2,
      -e.h / 2,
      e.w,
      e.h
    );
    ctx.restore();
  }

  // UI
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, sans-serif";
  
  const hearts = "♥".repeat(hp) + "♡".repeat(MAX_HP - hp);
  ctx.fillText(`Score: ${score}    HP: ${hearts}`, 12, 24);

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
