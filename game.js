const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Keep gameplay the same everywhere by using a fixed "logical" resolution.
const BASE_W = 800;
const BASE_H = 450;

// Optional: crisp pixel art
ctx.imageSmoothingEnabled = false;

// Player images
const playerImage = new Image();
playerImage.src = "artist.png";

const playerShootImage = new Image();
playerShootImage.src = "artist2.png";

// Enemy images
const enemyImages = [
  "enemy-brain3.png",
  "enemy-hand.png",
  "enemy-ai.png"
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

// Bullet image
const bulletImage = new Image();
bulletImage.src = "bullet.png";

// Keyboard/touch input share the same "keys" set
const keys = new Set();

window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Touch buttons -> emulate keys
function pressKey(k) { keys.add(k); }
function releaseKey(k) { keys.delete(k); }

document.querySelectorAll("#controls button").forEach((btn) => {
  const k = btn.dataset.k;

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    pressKey(k);
  });

  btn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    releaseKey(k);
  });

  btn.addEventListener("pointercancel", () => releaseKey(k));
  btn.addEventListener("pointerleave", () => releaseKey(k));
});

// Responsive canvas sizing (letterbox to keep 16:9)
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  // Fit BASE_W x BASE_H into the viewport while preserving aspect ratio
  const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
  const cssW = Math.floor(BASE_W * scale);
  const cssH = Math.floor(BASE_H * scale);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  // High-DPI backbuffer; keep drawing in BASE coords
  canvas.width = Math.floor(BASE_W * dpr);
  canvas.height = Math.floor(BASE_H * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const player = { x: 60, y: 200, w: 62, h: 62, speed: 260 };
const bullets = [];
const enemies = [];

let lastTime = performance.now();
let shootCooldown = 0;
let spawnTimer = 0;
let score = 0;
let alive = true;

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
  shootCooldown = 0;
  spawnTimer = 0.3;
}

function update(dt) {
  if (!alive) {
    if (keys.has("r")) reset();
    return;
  }

  // Movement (WASD / arrow keys)
  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");

  let vx = 0, vy = 0;
  if (up) vy -= 1;
  if (down) vy += 1;
  if (left) vx -= 1;
  if (right) vx += 1;

  // Normalize diagonal
  const len = Math.hypot(vx, vy) || 1;
  vx /= len; vy /= len;

  player.x += vx * player.speed * dt;
  player.y += vy * player.speed * dt;

  player.x = clamp(player.x, 0, BASE_W - player.w);
  player.y = clamp(player.y, 0, BASE_H - player.h);

  // Shooting (space)
  const spaceDown = keys.has(" ") || keys.has("space");
  shootCooldown -= dt;

  if (spaceDown && shootCooldown <= 0) {
    bullets.push({
      x: player.x + player.w - 6,
      // smaller bullet + moved down ~3px
      y: player.y + (player.h - 10) / 2 + 3,
      w: 44,
      h: 10,
      speed: 420
    });
    shootCooldown = 0.18;
  }

  // Bullets move
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].speed * dt;
    if (bullets[i].x > BASE_W) bullets.splice(i, 1);
  }

  // Spawn enemies (timed)
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
      img
    });

    spawnTimer = 0.65;
  }

  // Enemies move
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].x -= enemies[i].speed * dt;
    if (enemies[i].x + enemies[i].w < 0) enemies.splice(i, 1);
  }

  // Bullet-enemy collisions
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    let hit = false;
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      if (aabb(enemies[ei], bullets[bi])) {
        bullets.splice(bi, 1);
        hit = true;
        break;
      }
    }
    if (hit) {
      enemies.splice(ei, 1);
      score += 10;
    }
  }

  // Player-enemy collisions
  for (const e of enemies) {
    if (aabb(player, e)) {
      alive = false;
      break;
    }
  }
}

function draw() {
  // clear using BASE coords (because ctx transform is DPR only)
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  // Player: show artist2.png as long as space is held
  const spaceDown = keys.has(" ") || keys.has("space");
  const pImg = spaceDown ? playerShootImage : playerImage;

  if (pImg.complete) {
    ctx.drawImage(pImg, player.x, player.y, player.w, player.h);
  }

  // Bullets
  for (const b of bullets) {
    if (bulletImage.complete) {
      ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h);
    }
  }

  // Enemies
  for (const e of enemies) {
    if (e.img && e.img.complete) {
      ctx.drawImage(e.img, e.x, e.y, e.w, e.h);
    }
  }

  // UI
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 24);

  if (!alive) {
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("Game Over", BASE_W / 2 - 70, BASE_H / 2);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Press R to restart", BASE_W / 2 - 70, BASE_H / 2 + 28);
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
