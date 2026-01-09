const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Optional: crisp pixel art (remove if you want smoothing)
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

const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Player sprite is 62x62
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

  // Normalize diagonal movement
  const len = Math.hypot(vx, vy) || 1;
  vx /= len;
  vy /= len;

  player.x += vx * player.speed * dt;
  player.y += vy * player.speed * dt;

  player.x = clamp(player.x, 0, canvas.width - player.w);
  player.y = clamp(player.y, 0, canvas.height - player.h);

  // Shooting (space)
  const spaceDown = keys.has(" ") || keys.has("space");
  shootCooldown -= dt;

  if (spaceDown && shootCooldown <= 0) {
    bullets.push({
      x: player.x + player.w - 6,
      y: player.y + player.h / 2 - 6 + 9,
      w: 40,
      h: 8,
      speed: 420
    });
    shootCooldown = 0.18;
  }

  // Bullets move
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].speed * dt;
    if (bullets[i].x > canvas.width) bullets.splice(i, 1);
  }

  // Spawn enemies (timed)
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const h = 18 + Math.random() * 30;
    const img = enemyImages[Math.floor(Math.random() * enemyImages.length)];

    enemies.push({
      x: canvas.width + 20,
      y: Math.random() * (canvas.height - h),
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Player (show artist2.png for as long as space is held)
  const spaceDown = keys.has(" ") || keys.has("space");
  const pImg = spaceDown ? playerShootImage : playerImage;

  if (pImg.complete) {
    ctx.drawImage(pImg, player.x, player.y, player.w, player.h);
  }

  // Bullets (image)
  for (const b of bullets) {
    if (bulletImage.complete) {
      ctx.drawImage(bulletImage, b.x, b.y, b.w, b.h);
    }
  }

  // Enemies (images)
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
    ctx.fillText("Game Over", canvas.width / 2 - 70, canvas.height / 2);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Press R to restart", canvas.width / 2 - 70, canvas.height / 2 + 28);
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
