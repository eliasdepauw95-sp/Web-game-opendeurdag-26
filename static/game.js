const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
let lastTime = 0;

// ================= TOWER DEFINITIES =================
// type: { color, range, damage, fireRate(ms), cost, name }
const TOWER_DEFS = {
1: { color: '#00BFFF', range: 120, damage: 15, fireRate: 500,  cost: 50,  label: 'Basic'  },
2: { color: '#FF4500', range: 170, damage: 50, fireRate: 1500, cost: 80,  label: 'Heavy'  },
3: { color: '#00FF7F', range: 400, damage: 150, fireRate: 2000, cost: 150, label: 'Sniper' },
4: { color: '#FFD700', range: 100, damage: 10,  fireRate: 200,  cost: 60,  label: 'Rapid'  },
5: { color: '#BF5FFF', range: 140, damage: 10, fireRate: 1000, cost: 90,  label: 'Freeze'   },
};

// ================= ENEMY DEFINITIES =================
// type: { color, hpMult, speedMult, rewardMult, armor, slowImmune }
const ENEMY_DEFS = {
    basic:   { color: '#e74c3c', hpMult: 1.0, speedMult: 1.0, rewardMult: 1.0, armor: 0    },
    fast:    { color: '#f1c40f', hpMult: 0.5, speedMult: 2.2, rewardMult: 0.8, armor: 0    },
    tank:    { color: '#8e44ad', hpMult: 3.5, speedMult: 0.5, rewardMult: 2.5, armor: 0    },
    armored: { color: '#95a5a6', hpMult: 1.5, speedMult: 0.8, rewardMult: 1.8, armor: 8    },
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

// ================= PAD =================
const path = [
    {x: 0, y: 7}, {x: 4, y: 7}, {x: 4, y: 3}, {x: 8, y: 3},
    {x: 8, y: 10}, {x: 12, y: 10}, {x: 12, y: 5}, {x: 16, y: 5},
    {x: 16, y: 12}, {x: 19, y: 12}
];

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
        this.level      = 1;
        this.upgradeCost = def.cost;

        this.lastShot = 0;
        this.target   = null;
    }

    update() {
        this.findTarget();
        const now = Date.now();
        if (this.target && now - this.lastShot > this.fireRate) {
            this.shoot();
            this.lastShot = now;
        }
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
            new Projectile(this.x, this.y, this.target, this.damage, this.type, this.color)
        );
    }

    draw() {
        // basis blok
        ctx.fillStyle = '#3d2b0e';
        ctx.fillRect(this.x - 15, this.y - 15, 30, 30);

        // cirkel met toren kleur
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 12 + this.level, 0, Math.PI * 2);
        ctx.fill();

        // level nummer
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.level, this.x, this.y + 4);

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
        const r = this.type === 'tank' ? 18 : this.type === 'fast' ? 10 : 14;

        // slow effect: blauwe gloed
        if (Date.now() < this.slowUntil) {
            ctx.fillStyle = 'rgba(100,180,255,0.35)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();

        // armor indicatie: rand
        if (this.armor > 0) {
            ctx.strokeStyle = '#bdc3c7';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // HP balk
        const bw = r * 2 + 4;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - bw / 2, this.y - r - 8, bw, 4);
        ctx.fillStyle = this.health / this.maxHealth > 0.5 ? 'lime' : 'orange';
        ctx.fillRect(this.x - bw / 2, this.y - r - 8, bw * (this.health / this.maxHealth), 4);
    }
}

// ================= PROJECTILE =================
class Projectile {
    constructor(x, y, target, damage, towerType, color) {
        this.x          = x;
        this.y          = y;
        this.target     = target;
        this.damage     = damage;
        this.towerType  = towerType;
        this.color      = color;
        this.speed      = towerType === 3 ? 12 : towerType === 4 ? 9 : 7;
    }

    update() {
        if (!this.target) return false;

        const dx   = this.target.x - this.x;
        const dy   = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;

        if (dist < 10) {
            const actual = this.target.takeDamage(this.damage);

            damageTexts.push({
                x:    this.target.x,
                y:    this.target.y - 10,
                text: actual,
                life: 40,
                color: this.towerType === 5 ? '#BF5FFF' : 'yellow'
            });

            // slow toren vertraagt vijand 1.5 seconden
            if (this.towerType === 5) {
                this.target.slowUntil  = Date.now() + 1500;
                this.target.slowFactor = 0.35;
            }

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
    const queue = [];

    for (let i = 0; i < count; i++) {
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

    const refund = Math.floor(t.upgradeCost / 1.5) + Math.floor(TOWER_DEFS[t.type].cost / 2);
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
        document.getElementById('lives').textContent = gameState.lives;
        document.getElementById('wave').textContent  = gameState.wave;
        document.getElementById('score').textContent = gameState.score;

        // wave einde check
        if (gameState.enemies.length === 0 && gameState.waveActive && !gameState.spawningWave) {
            gameState.wave++;
            gameState.waveActive = false;
            setWaveButton(true);
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
for (let i = 1; i <= 5; i++) {
    document.getElementById(`tower${i}`).onclick = () => {
        gameState.selectedTowerType = i;
    };
}

document.getElementById('startWave').onclick = () => spawnWave();

// START
setWaveButton(true);
loop();