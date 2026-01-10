const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const BASE_W = 800;
const BASE_H = 450;

ctx.imageSmoothingEnabled = false;

// Player images
const playerImage = new Image();
playerImage.src = "artist.png";

const playerShootImage = new Image();
playerShootImage.src = "artist2.png";

// Enemy images
const enemyImages = ["enemy-brain3.png", "enemy-hand.png", "enemy-ai.png"].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

// Bullet image
const bulletImage = new Image();
bulletImage.src = "bullet.png";

// Input
const keys = new Set();
let canShoot = true;
let spaceHeld = false;

// --- helpers for mobile/keyboard unified movement ---
function pressKey(k) {
  keys.add(k);
}
function releaseKey(k) {
  keys.delete(k);
}

// Keyboard movement tracking
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Single-shot space handling (prevents repeat + prevents page scroll/button activation)
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

// --- Mobile controls wiring (RESTORED) ---
function handleControlDown(k) {
  // Shoot: one bullet per press
  if (k === "space" || k === " ") {
    spaceHeld = true;
    if (canShoot) {
      shootBullet();
      canShoot = false;
    }
    return;
  }

  // Movement: hold
  pressKey(k);
}

function handleControlUp(k) {
  if (k === "space" || k === " ") {
    spaceHeld = false;
    canShoot = true;
    return;
  }

  releaseKey(k);
}

const controlButtons = document.querySelectorAll("#controls button");
controlButtons.forEach((btn) => {
  const k = btn.dataset.k;

  // Avoid focus/spacebar weirdness
  btn.setAttribute("tabindex", "-1");

  // Pointer events (modern)
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    handleControlDown(k);
  });

  btn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    handleControlUp(k);
  });

  btn.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    handleControlUp(k);
  });

  // Touch fallback (iOS Safari can be flaky with pointer events)
  btn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleControlDown(k);
    },
    { passive: false }
  );

  btn.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      handleControlUp(k);
    },
    { passive: false }
  );

  btn.addEventListener(
    "touchcancel",
    (e) => {
      e.preventDefault();
      handleControlUp(k);
    },
    { passive: false }
  );
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
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Game state
const player = { x: 60, y: 200, w: 62, h: 62, speed: 260 };
const bullets = [];
const enemies = [];

let lastTime = performance.now();
let spawnTimer = 0;
let score = 0;
let alive = true;

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
  player.x = 60;
  player.y = 200;
  score = 0;
  alive = true;
  spawnTimer = 0.3;
  canShoot = true;
  spaceHeld = false;

  // Clear any “stuck” movement keys (mobile edge case)
  keys.clear();
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

function update(dt) {
  if (!alive) return;

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

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].speed * dt;
    if (bullets[i].x > BASE_W) bullets.splice(i, 1);
  }

  // Spawn enemies
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const h = 18 + Math.random() * 30;
    const img = enemyImages[Math.floor(Math.random() * enemyImages.length)];

    enemies.push({
      x: BASE_W + 20,
      y: Math.random() * (BASE_H - h),
      w: 32,
      h,
      speed: 120 + Math.random() * 160,
      img,
      wiggleXSpeed: 4 + Math.random() * 3,
      wiggleYSpeed: 4 + Math.random() * 3,
      wiggleXAmount: 0.06 + Math.random() * 0.04,
      wiggleYAmount: 0.06 + Math.random() * 0.04,
      wigglePhaseX: Math.random() * Math.PI * 2,
      wigglePhaseY: Math.random() * Math.PI * 2,
    });

    spawnTimer = 0.65;
  }

  // Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.x -= e.speed * dt;
    e.wigglePhaseX += e.wiggleXSpeed * dt;
    e.wigglePhaseY += e.wiggleYSpeed * dt;

    if (e.x + e.w < 0) enemies.splice(i, 1);
  }

  // Collisions
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

  for (const e of enemies) {
    if (aabb(player, e)) {
      alive = false;
      restartBtn.style.display = "block";
      break;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  const pImg = spaceHeld ? playerShootImage : playerImage;
  if (pImg.complete) ctx.drawImage(pImg, player.x, player.y, player.w, player.h);

  for (const b of bullets) {
    if (bulletImage.complete) ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h);
  }

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

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 24);

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
