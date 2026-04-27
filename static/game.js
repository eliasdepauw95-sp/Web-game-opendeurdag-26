const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
let autoStartEnabled = false;
let lastTime = 0;
let autoWaveTimeout = null;

// ================= TOWER DEFINITIES =================
// type: { color, range, damage, fireRate(ms), cost, name }
const TOWER_DEFS = {
1: { color: '#00BFFF', range: 120, damage: 15, fireRate: 500,  cost: 50,  label: 'Basic'  },
2: { color: '#FF4500', range: 170, damage: 50, fireRate: 1500, cost: 80,  label: 'Heavy'  },
3: { color: '#00FF7F', range: 400, damage: 150, fireRate: 3000, cost: 150, label: 'Sniper', pierce: 2 },
4: { color: '#FFD700', range: 100, damage: 10,  fireRate: 200,  cost: 60,  label: 'Rapid'  },
5: { color: '#BF5FFF', range: 140, damage: 10, fireRate: 1000, cost: 90,  label: 'Freeze'   },
6: { color: '#00CED1', range: 150, damage: 10, fireRate: 1500, cost: 130, label: 'Pulse', aoe: true },
};

// ================= ENEMY DEFINITIES =================
// type: { color, hpMult, speedMult, rewardMult, armor, slowImmune }
const ENEMY_DEFS = {
    basic:   { color: '#e74c3c', hpMult: 1.0, speedMult: 1.0, rewardMult: 1.0, armor: 0    },
    fast:    { color: '#f1c40f', hpMult: 0.5, speedMult: 2.2, rewardMult: 0.8, armor: 0    },
    tank:    { color: '#8e44ad', hpMult: 3.5, speedMult: 0.5, rewardMult: 2.5, armor: 0    },
    armored: { color: '#95a5a6', hpMult: 1.5, speedMult: 0.8, rewardMult: 1.8, armor: 8    },
    boss:    { color: '#2c3e50', hpMult: 11.0, speedMult: 0.45, rewardMult: 8.0, armor: 14 },
};

// ================= GAME STATE =================
let gameState = {
    gold: 100,
    lives: 20,
    wave: 1,
    score: 0,

    selectedTowerType: null,
    selectedTower: null,

    towers: [],
    enemies: [],
    projectiles: [],

    gameOver: false,
    waveActive: false,
    spawningWave: false,
};

let damageTexts = [];
let pulseEffects = [];

// ================= PAD =================
const path = [
    {x: 0, y: 7}, {x: 4, y: 7}, {x: 4, y: 3}, {x: 8, y: 3},
    {x: 8, y: 10}, {x: 12, y: 10}, {x: 12, y: 5}, {x: 16, y: 5},
    {x: 16, y: 12}, {x: 19, y: 12}
];

function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#9fd5ff');
    bg.addColorStop(0.5, '#7cc987');
    bg.addColorStop(1, '#4a9d57');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // zachte heuvels voor diepte
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(190, 560, 230, Math.PI, Math.PI * 2);
    ctx.arc(560, 580, 270, Math.PI, Math.PI * 2);
    ctx.arc(890, 560, 200, Math.PI, Math.PI * 2);
    ctx.fill();

    // subtiele tegel-grid
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawPath() {
    ctx.strokeStyle = '#D2691E';
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.moveTo(path[0].x * TILE_SIZE + 20, path[0].y * TILE_SIZE + 20);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * TILE_SIZE + 20, path[i].y * TILE_SIZE + 20);
    }
    ctx.stroke();
}

function formatLives(lives) {
    if (lives <= 0) return '0';
    const visibleHearts = Math.min(5, lives);
    const hearts = '♥'.repeat(visibleHearts);
    return lives > 5 ? `${hearts} x${lives}` : hearts;
}

// ================= TOWER =================
class Tower {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;

        const def = TOWER_DEFS[type];
        this.color      = def.color;
        this.range      = def.range;
        this.damage     = def.damage;
        this.fireRate   = def.fireRate;
        this.isAoe      = !!def.aoe;
        this.pierce     = def.pierce || 0;
        this.level      = 1;
        this.upgradeCost = def.cost;

        this.lastShot = 0;
        this.target   = null;
    }

    update() {
        const now = Date.now();

        if (this.isAoe) {
            const enemiesInRange = this.getEnemiesInRange();
            if (enemiesInRange.length > 0 && now - this.lastShot > this.fireRate) {
                this.pulse(enemiesInRange);
                this.lastShot = now;
            }
            return;
        }

        this.findTarget();
        if (this.target && now - this.lastShot > this.fireRate) {
            this.shoot();
            this.lastShot = now;
        }
    }

    getEnemiesInRange() {
        return gameState.enemies.filter(e => Math.hypot(this.x - e.x, this.y - e.y) < this.range);
    }

    findTarget() {
        this.target = null;
        let closest = Infinity;
        for (let e of gameState.enemies) {
            const d = Math.hypot(this.x - e.x, this.y - e.y);
            if (d < this.range && d < closest) {
                closest = d;
                this.target = e;
            }
        }
    }

    shoot() {
        gameState.projectiles.push(
            new Projectile(this.x, this.y, this.target, this.damage, this.type, this.color, this.pierce)
        );
    }

    pulse(enemiesInRange) {
        pulseEffects.push({
            x: this.x,
            y: this.y,
            maxRadius: this.range,
            life: 18,
            maxLife: 18,
            color: this.color
        });

        for (let enemy of enemiesInRange) {
            const actual = enemy.takeDamage(this.damage);
            damageTexts.push({
                x: enemy.x,
                y: enemy.y - 10,
                text: actual,
                life: 40,
                color: this.color
            });
        }
    }

    draw() {
        const now = Date.now();
        const angle = this.target
            ? Math.atan2(this.target.y - this.y, this.target.x - this.x)
            : -Math.PI / 2;

        ctx.save();

        // grondschaduw
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 16, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.type === 1) {
            // Basic: klassieke blauwe koepel
            ctx.fillStyle = '#3f2a14';
            ctx.fillRect(this.x - 16, this.y - 16, 32, 32);
            ctx.fillStyle = '#214d78';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7fd7ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 10, 0.3, Math.PI - 0.3);
            ctx.stroke();

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#1e2328';
            ctx.fillRect(0, -3, 16, 6);
            ctx.fillStyle = '#00BFFF';
            ctx.fillRect(13, -2, 5, 4);
            ctx.restore();
        } else if (this.type === 2) {
            // Heavy: pantserkast met dikke loop
            ctx.fillStyle = '#4b2e15';
            ctx.fillRect(this.x - 17, this.y - 17, 34, 34);
            ctx.fillStyle = '#8b3d1e';
            ctx.fillRect(this.x - 13, this.y - 13, 26, 26);
            ctx.strokeStyle = '#f7a45b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(this.x - 13, this.y - 13, 26, 26);
            for (let i = 0; i < 4; i++) {
                const bx = this.x + (i < 2 ? -9 : 9);
                const by = this.y + (i % 2 === 0 ? -9 : 9);
                ctx.fillStyle = '#f7a45b';
                ctx.beginPath();
                ctx.arc(bx, by, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#1a1f24';
            ctx.fillRect(0, -4, 20, 8);
            ctx.fillStyle = '#ff7f3d';
            ctx.fillRect(18, -3, 7, 6);
            ctx.restore();
        } else if (this.type === 3) {
            // Sniper: slanke basis + scope
            ctx.fillStyle = '#2e3a2f';
            ctx.beginPath();
            ctx.moveTo(this.x - 12, this.y + 12);
            ctx.lineTo(this.x + 12, this.y + 12);
            ctx.lineTo(this.x + 8, this.y - 10);
            ctx.lineTo(this.x - 8, this.y - 10);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#1d2520';
            ctx.beginPath();
            ctx.arc(this.x, this.y - 2, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.translate(this.x, this.y - 2);
            ctx.rotate(angle);
            ctx.fillStyle = '#111';
            ctx.fillRect(0, -2, 26, 4);
            ctx.fillStyle = '#00FF7F';
            ctx.fillRect(23, -1.5, 6, 3);
            ctx.fillStyle = '#7affb2';
            ctx.fillRect(8, -5, 8, 2);
            ctx.restore();
        } else if (this.type === 4) {
            // Rapid: rotor met dubbele loops
            const spin = now / 140;
            ctx.fillStyle = '#5e4a0f';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d4ac0d';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(spin);
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.fillStyle = '#1f1f1f';
                ctx.fillRect(0, -1.5, 12, 3);
            }
            ctx.restore();

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#1f1f1f';
            ctx.fillRect(0, -5, 14, 3);
            ctx.fillRect(0, 2, 14, 3);
            ctx.fillStyle = '#ffe066';
            ctx.fillRect(12, -5, 4, 3);
            ctx.fillRect(12, 2, 4, 3);
            ctx.restore();
        } else if (this.type === 5) {
            // Freeze: kristaltoren
            ctx.fillStyle = '#33214f';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#b78fff';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - 14);
            ctx.lineTo(this.x + 9, this.y - 2);
            ctx.lineTo(this.x + 4, this.y + 12);
            ctx.lineTo(this.x - 4, this.y + 12);
            ctx.lineTo(this.x - 9, this.y - 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#e4d4ff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - 11);
            ctx.lineTo(this.x + 5, this.y + 8);
            ctx.lineTo(this.x - 5, this.y + 8);
            ctx.closePath();
            ctx.stroke();
        } else if (this.type === 6) {
            // Pulse: energie-emitter met ringen
            const pulse = 0.5 + 0.5 * Math.sin(now / 180);
            ctx.fillStyle = '#1a3e42';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5cebf1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#00CED1';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 5 + pulse * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(0,206,209,${0.45 + pulse * 0.45})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 16 + pulse * 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // level badge
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + 1, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.level, this.x, this.y + 4);

        ctx.restore();

        // range cirkel als geselecteerd
        if (gameState.selectedTower === this) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

// ================= ENEMY =================
class Enemy {
    constructor(type, baseHp, baseSpeed, baseReward) {
        this.x = path[0].x * TILE_SIZE + 20;
        this.y = path[0].y * TILE_SIZE + 20;
        this.index = 0;

        const def = ENEMY_DEFS[type];
        this.type       = type;
        this.color      = def.color;
        this.armor      = def.armor;

        this.health     = baseHp    * def.hpMult;
        this.maxHealth  = this.health;
        this.speed      = baseSpeed * def.speedMult;
        this.reward     = Math.round(baseReward * def.rewardMult);

        this.rewardGiven = false;

        // slow systeem
        this.slowUntil  = 0;
        this.slowFactor = 1;
    }

    update(delta) {
        if (this.index >= path.length - 1) {
            gameState.lives--;
            return false;
        }

        const t  = path[this.index + 1];
        const tx = t.x * TILE_SIZE + 20;
        const ty = t.y * TILE_SIZE + 20;

        const dx   = tx - this.x;
        const dy   = ty - this.y;
        const dist = Math.hypot(dx, dy);

        // pas slow toe als actief
        const slow = Date.now() < this.slowUntil ? this.slowFactor : 1;
        const spd  = this.speed * slow;

        if (dist < spd * delta) {
            this.index++;
        } else {
            this.x += (dx / dist) * spd * delta;
            this.y += (dy / dist) * spd * delta;
        }

        return true;
    }

    takeDamage(dmg) {
        const actual = Math.max(1, dmg - this.armor);
        this.health -= actual;
        return actual;
    }

    draw() {
        const r = this.type === 'boss' ? 24 : this.type === 'tank' ? 18 : this.type === 'fast' ? 10 : 14;
        const t = path[Math.min(this.index + 1, path.length - 1)];
        const dirX = t.x * TILE_SIZE + 20 - this.x;
        const dirY = t.y * TILE_SIZE + 20 - this.y;
        const dirA = Math.atan2(dirY, dirX);
        const now = Date.now();
        const bob = Math.sin(now / 220 + this.x * 0.03) * (this.type === 'boss' ? 0.6 : 1.2);
        const y = this.y + bob;

        // slow effect: blauwe gloed
        if (Date.now() < this.slowUntil) {
            ctx.fillStyle = 'rgba(100,180,255,0.28)';
            ctx.beginPath();
            ctx.arc(this.x, y, r + 6, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.type === 'basic') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            // soldier top-view
            ctx.fillStyle = '#3d5d2f';
            ctx.fillRect(-4.5, -2, 9, 11);
            ctx.fillStyle = '#5f7b46';
            ctx.fillRect(-3.2, -9, 6.4, 7);

            ctx.strokeStyle = '#2a3a22';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, -5.5, 3.2, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#4e693b';
            ctx.fillRect(-7.5, -1, 3, 6);
            ctx.fillRect(4.5, -1, 3, 6);

            ctx.fillStyle = '#2b2b2b';
            ctx.fillRect(-4.5, 9, 3.2, 3);
            ctx.fillRect(1.3, 9, 3.2, 3);

            // rifle
            ctx.fillStyle = '#2f2f31';
            ctx.fillRect(3.8, -0.8, 9, 1.6);
            ctx.fillStyle = '#7b5a36';
            ctx.fillRect(2, -0.8, 2.5, 1.6);
            ctx.restore();
        } else if (this.type === 'fast') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            // fighter jet top-view
            const jetGrad = ctx.createLinearGradient(-14, -9, 16, 9);
            jetGrad.addColorStop(0, '#cfd7de');
            jetGrad.addColorStop(1, '#7f8e9a');
            ctx.fillStyle = jetGrad;
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(2, 7);
            ctx.lineTo(-6, 11);
            ctx.lineTo(-4, 4);
            ctx.lineTo(-14, 4);
            ctx.lineTo(-10, 0);
            ctx.lineTo(-14, -4);
            ctx.lineTo(-4, -4);
            ctx.lineTo(-6, -11);
            ctx.lineTo(2, -7);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#7ed7ff';
            ctx.beginPath();
            ctx.ellipse(3.5, 0, 3.5, 2.4, 0, 0, Math.PI * 2);
            ctx.fill();

            const flame = 0.6 + 0.4 * Math.sin(now / 120 + this.x * 0.08);
            ctx.fillStyle = `rgba(255,175,45,${0.4 + flame * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.lineTo(-22 - flame * 4, 2.4);
            ctx.lineTo(-22 - flame * 4, -2.4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (this.type === 'tank') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            // real tank top-view
            ctx.fillStyle = '#3f4d36';
            ctx.fillRect(-16, -11, 7, 22);
            ctx.fillRect(9, -11, 7, 22);

            ctx.fillStyle = '#667852';
            ctx.fillRect(-10, -12, 20, 24);
            ctx.strokeStyle = '#2f3828';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(-10, -12, 20, 24);

            ctx.fillStyle = '#2f3828';
            for (let i = -8; i <= 8; i += 4) {
                ctx.beginPath();
                ctx.arc(-12.5, i, 1.2, 0, Math.PI * 2);
                ctx.arc(12.5, i, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = '#73895c';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#435138';
            ctx.stroke();

            ctx.fillStyle = '#2e332c';
            ctx.fillRect(5.5, -1.3, 14, 2.6);
            ctx.fillRect(17, -1.8, 4, 3.6);
            ctx.restore();
        } else if (this.type === 'armored') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            // armored vehicle top-view (APC)
            const body = ctx.createLinearGradient(-16, -11, 16, 11);
            body.addColorStop(0, '#9ea7ad');
            body.addColorStop(1, '#5f6b74');
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(8, 11);
            ctx.lineTo(-11, 11);
            ctx.lineTo(-16, 6);
            ctx.lineTo(-16, -6);
            ctx.lineTo(-11, -11);
            ctx.lineTo(8, -11);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#4c565e';
            ctx.lineWidth = 1.4;
            ctx.stroke();

            ctx.fillStyle = '#3d5f79';
            ctx.fillRect(3, -4.2, 6.5, 8.4);
            ctx.fillStyle = '#a9b4bb';
            ctx.fillRect(-4, -3, 4, 6);

            ctx.fillStyle = '#252b30';
            for (let i = -7; i <= 7; i += 4.7) {
                ctx.beginPath();
                ctx.arc(-12.8, i, 1.8, 0, Math.PI * 2);
                ctx.arc(10.8, i, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            ctx.strokeStyle = 'rgba(212,221,226,0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, y, r + 2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'boss') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            // rotating halo
            ctx.save();
            ctx.rotate(now / 480);
            ctx.strokeStyle = 'rgba(241,196,15,0.75)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                ctx.rotate(Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(22, 0);
                ctx.lineTo(29, 0);
                ctx.stroke();
            }
            ctx.restore();

            const g = ctx.createRadialGradient(-4, -5, 5, 0, 0, 24);
            g.addColorStop(0, '#6d7f93');
            g.addColorStop(0.55, '#34495e');
            g.addColorStop(1, '#1b2838');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, 24, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1f2a35';
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#c0392b';
            ctx.fillRect(9, -3, 12, 6);
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(-4, -19, 8, 4);
            ctx.fillRect(-11, -16, 6, 3);
            ctx.fillRect(5, -16, 6, 3);

            ctx.fillStyle = '#ffdf67';
            ctx.beginPath();
            ctx.arc(-5, -1, 2.2, 0, Math.PI * 2);
            ctx.arc(5, -1, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(241,196,15,0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(this.x, y, r + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // HP balk
        const bw = r * 2 + 4;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - bw / 2, y - r - 10, bw, 5);
        ctx.fillStyle = this.health / this.maxHealth > 0.5 ? 'lime' : 'orange';
        ctx.fillRect(this.x - bw / 2, y - r - 10, bw * (this.health / this.maxHealth), 5);
    }
}

// ================= PROJECTILE =================
class Projectile {
    constructor(x, y, target, damage, towerType, color, pierce = 0) {
        this.x          = x;
        this.y          = y;
        this.target     = target;
        this.damage     = damage;
        this.towerType  = towerType;
        this.color      = color;
        this.speed      = towerType === 3 ? 12 : towerType === 4 ? 9 : 7;
        this.pierceLeft = pierce + 1;
        this.hitEnemies = new Set();
        this.vx         = 0;
        this.vy         = 0;

        if (pierce > 0 && target) {
            const dx = target.x - x;
            const dy = target.y - y;
            const dist = Math.hypot(dx, dy) || 1;
            this.vx = (dx / dist) * this.speed;
            this.vy = (dy / dist) * this.speed;
        }
    }

    dealHit(enemy) {
        const actual = enemy.takeDamage(this.damage);

        damageTexts.push({
            x:    enemy.x,
            y:    enemy.y - 10,
            text: actual,
            life: 40,
            color: this.towerType === 5 ? '#BF5FFF' : 'yellow'
        });

        // slow toren vertraagt vijand 1.5 seconden
        if (this.towerType === 5) {
            enemy.slowUntil  = Date.now() + 1500;
            enemy.slowFactor = 0.25;
        }
    }

    update() {
        if (this.pierceLeft > 1) {
            this.x += this.vx;
            this.y += this.vy;

            for (let enemy of gameState.enemies) {
                if (this.hitEnemies.has(enemy)) continue;
                if (Math.hypot(enemy.x - this.x, enemy.y - this.y) < 10) {
                    this.hitEnemies.add(enemy);
                    this.dealHit(enemy);
                    this.pierceLeft--;
                    if (this.pierceLeft <= 0) return false;
                }
            }

            if (this.x < -20 || this.x > canvas.width + 20 || this.y < -20 || this.y > canvas.height + 20) {
                return false;
            }

            return true;
        }

        if (!this.target) return false;

        const dx   = this.target.x - this.x;
        const dy   = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;

        if (dist < 10) {
            this.dealHit(this.target);
            return false;
        }

        return true;
    }

    draw() {
        const size = this.towerType === 3 ? 5 : this.towerType === 4 ? 3 : 4;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ================= WAVE SAMENSTELLING =================
// Geeft een lijst van enemy types op basis van wave nummer
function buildWaveQueue(wave) {
    const count = wave * 4 + 2;
    const isBossWave = wave % 5 === 0;
    const normalCount = Math.max(2, count - (isBossWave ? 1 : 0));
    const queue = [];

    for (let i = 0; i < normalCount; i++) {
        let type = 'basic';

        if (wave >= 2) {
            // kans op fast stijgt per wave
            const roll = Math.random();
            const fastChance    = Math.min(0.35, wave * 0.06);
            const tankChance    = wave >= 3 ? Math.min(0.25, (wave - 2) * 0.06) : 0;
            const armorChance   = wave >= 4 ? Math.min(0.20, (wave - 3) * 0.05) : 0;

            if (roll < armorChance) {
                type = 'armored';
            } else if (roll < armorChance + tankChance) {
                type = 'tank';
            } else if (roll < armorChance + tankChance + fastChance) {
                type = 'fast';
            }
        }

        queue.push(type);
    }

    if (isBossWave) {
        queue.push('boss');
    }

    return queue;
}

// ================= WAVE SPAWNEN =================
function spawnWave() {
    if (gameState.waveActive || gameState.spawningWave) return;

    gameState.waveActive   = true;
    gameState.spawningWave = true;
    setWaveButton(false);

    const baseHp     = 30 * Math.pow(1.12, gameState.wave);
    const baseSpeed  = 0.8 + gameState.wave * 0.02;
    const baseReward = 8 + gameState.wave * 2;

    const queue = buildWaveQueue(gameState.wave);
    let i = 0;

    const interval = setInterval(() => {
        if (i >= queue.length) {
            clearInterval(interval);
            gameState.spawningWave = false;
            return;
        }
        gameState.enemies.push(new Enemy(queue[i], baseHp, baseSpeed, baseReward));
        i++;
    }, 700);
}

// ================= UI FUNCTIES =================
function updateTowerButtons() {
    document.querySelectorAll('.tower-btn').forEach(btn => {
        const cost = parseInt(btn.dataset.cost);
        btn.disabled = gameState.gold < cost;
    });

    // geselecteerde toren highlighten
    document.querySelectorAll('.tower-btn').forEach(btn => {
        const id = parseInt(btn.id.replace('tower', ''));
        btn.classList.toggle('selected', id === gameState.selectedTowerType);
    });
}

function setWaveButton(enabled) {
    const btn = document.getElementById('startWave');
    btn.disabled   = !enabled;
    btn.style.opacity = enabled ? 1 : 0.5;
    btn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
}

function updateAutoStartButton() {
    const btn = document.getElementById('autoStartToggle');
    btn.textContent = autoStartEnabled ? 'Auto: ON' : 'Auto: OFF';
    btn.classList.toggle('active', autoStartEnabled);
}

function queueAutoWaveStart(delay = 900) {
    if (!autoStartEnabled) return;
    if (autoWaveTimeout || gameState.waveActive || gameState.spawningWave || gameState.gameOver) return;

    autoWaveTimeout = setTimeout(() => {
        autoWaveTimeout = null;
        if (!gameState.gameOver && !gameState.waveActive && !gameState.spawningWave) {
            spawnWave();
        }
    }, delay);
}

function updateUpgradePanel() {
    const panel = document.getElementById('upgradePanel');
    const info  = document.getElementById('towerInfo');

    if (!gameState.selectedTower) {
        panel.style.display = 'none';
        return;
    }

    const t = gameState.selectedTower;
    const def = TOWER_DEFS[t.type];

    panel.style.display = 'flex';
    info.innerHTML =
        `<b>${def.label} Tower</b><br>` +
        `Level: ${t.level}<br>` +
        `Damage: ${Math.round(t.damage)}<br>` +
        `Range: ${Math.round(t.range)}<br>` +
        `Fire rate: ${Math.round(t.fireRate)}ms<br>` +
        `Upgrade cost: $${t.upgradeCost}`;

    const canAfford = gameState.gold >= t.upgradeCost;
    document.getElementById('fireBtn').disabled   = !canAfford;
    document.getElementById('damageBtn').disabled = !canAfford;
    document.getElementById('rangeBtn').disabled  = !canAfford;
}

// ================= UPGRADE KNOPPEN =================
function doUpgrade(type) {
    const t = gameState.selectedTower;
    if (!t || gameState.gold < t.upgradeCost) return;

    gameState.gold -= t.upgradeCost;
    t.level++;
    t.upgradeCost = Math.floor(t.upgradeCost * 1.5);

    if (type === 'fire')   t.fireRate  *= 0.9;
    if (type === 'damage') t.damage    *= 1.4;
    if (type === 'range')  t.range     += 20;
}

document.getElementById('fireBtn').onclick   = () => doUpgrade('fire');
document.getElementById('damageBtn').onclick = () => doUpgrade('damage');
document.getElementById('rangeBtn').onclick  = () => doUpgrade('range');

// ================= SELL KNOP =================
document.getElementById('sellBtn').onclick = () => {
    const t = gameState.selectedTower;
    if (!t) return;

    const refund = Math.floor(t.upgradeCost / 2) + Math.floor(TOWER_DEFS[t.type].cost / 2);
    gameState.gold += refund;

    gameState.towers = gameState.towers.filter(tower => tower !== t);
    gameState.selectedTower = null;
};

// ================= GAME LOOP =================
function loop(time = 0) {
    const delta = (time - lastTime) / 16.67;
    lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameState.gameOver) {

        drawBackground();
        drawPath();

        gameState.towers.forEach(t => { t.update(); t.draw(); });

        gameState.enemies = gameState.enemies.filter(e => {
            if (!e.update(delta)) return false;
            e.draw();
            return e.health > 0;
        });

        gameState.projectiles = gameState.projectiles.filter(p => {
            const ok = p.update();
            p.draw();
            return ok;
        });

        // pulse attack visual voor AOE torens
        pulseEffects = pulseEffects.filter(p => p.life > 0);
        for (let p of pulseEffects) {
            const progress = 1 - (p.life / p.maxLife);
            const radius = Math.max(10, p.maxRadius * progress);
            const alpha = p.life / p.maxLife;

            ctx.save();
            ctx.globalAlpha = 0.25 * alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.8 * alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2 + (1 - progress) * 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            p.life--;
        }

        // gold en score bij kill
        gameState.enemies.forEach(e => {
            if (e.health <= 0 && !e.rewardGiven) {
                gameState.gold  += e.reward;
                gameState.score += e.reward * 10;
                e.rewardGiven    = true;
            }
        });

        // damage tekst animatie
        damageTexts = damageTexts.filter(d => d.life > 0);
        for (let d of damageTexts) {
            ctx.fillStyle = d.color || 'yellow';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(d.text, d.x, d.y);
            d.y   -= 0.6;
            d.life--;
        }

        // UI updaten
        updateTowerButtons();
        updateUpgradePanel();

        document.getElementById('gold').textContent  = gameState.gold;
        document.getElementById('lives').textContent = formatLives(gameState.lives);
        document.getElementById('wave').textContent  = gameState.wave;
        document.getElementById('score').textContent = gameState.score;

        // wave einde check
        if (gameState.enemies.length === 0 && gameState.waveActive && !gameState.spawningWave) {
            gameState.wave++;
            gameState.waveActive = false;
            if (autoStartEnabled) {
                setWaveButton(false);
                queueAutoWaveStart(1200);
            } else {
                setWaveButton(true);
            }
        }

        // game over check
        if (gameState.lives <= 0) {
            gameState.gameOver = true;
            document.getElementById('finalScore').textContent = gameState.score;
            document.getElementById('gameOver').style.display = 'block';
        }
    }

    requestAnimationFrame(loop);
}

// ================= CANVAS KLIK =================
canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // klik op bestaande toren
    const tower = gameState.towers.find(t => Math.hypot(t.x - x, t.y - y) < 20);
    if (tower) {
        gameState.selectedTower = tower;
        return;
    }

    // klik op leeg: sluit panel
    gameState.selectedTower = null;

    // toren plaatsen
    if (gameState.selectedTowerType) {
        const def  = TOWER_DEFS[gameState.selectedTowerType];
        if (gameState.gold >= def.cost) {
            gameState.towers.push(new Tower(x, y, gameState.selectedTowerType));
            gameState.gold -= def.cost;
            gameState.selectedTowerType = null;
        }
    }
};

// ================= TOREN SELECTIE KNOPPEN =================
for (let i = 1; i <= 6; i++) {
    document.getElementById(`tower${i}`).onclick = () => {
        gameState.selectedTowerType = i;
    };
}

document.getElementById('startWave').onclick = () => spawnWave();
document.getElementById('autoStartToggle').onclick = () => {
    autoStartEnabled = !autoStartEnabled;
    updateAutoStartButton();

    if (!autoStartEnabled) {
        if (autoWaveTimeout) {
            clearTimeout(autoWaveTimeout);
            autoWaveTimeout = null;
        }
        if (!gameState.waveActive && !gameState.spawningWave && !gameState.gameOver) {
            setWaveButton(true);
        }
        return;
    }

    setWaveButton(false);
    queueAutoWaveStart(300);
};

// START
setWaveButton(true);
updateAutoStartButton();
loop();
