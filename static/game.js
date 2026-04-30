const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
let autoStartEnabled = false;
let lastTime = 0;
let autoWaveTimeout = null;
let gameStarted = false;
let gameSpeed = 1.0; // Global speed multiplier: 1.0 = normal, 2.0 = double speed, 0.5 = half speed
gameSpeed = Math.max(0.1, gameSpeed); // Prevent division by zero


// ================= TOWER DEFINITIES =================
// type: { color, range, damage, fireRate(ms), cost, name }
const TOWER_DEFS = {
1: { color: '#00BFFF', range: 100,  damage: 18,  fireRate: 500,  cost: 55,  label: 'Basic'  },
2: { color: '#FF4500', range: 140, damage: 50,  fireRate: 1500, cost: 80,  label: 'Heavy', armorPen: 2,  },
3: { color: '#00FF7F', range: 240, damage: 80, fireRate: 3000, cost: 175, label: 'Sniper', pierce: 1 },
4: { color: '#FFD700', range: 80,  damage: 8,   fireRate: 250,  cost: 70,  label: 'Rapid'  },
5: { color: '#BF5FFF', range: 80,  damage: 12,  fireRate: 1000, cost: 100, label: 'Freeze' },
6: { color: '#00CED1', range: 120, damage: 15,  fireRate: 1500, cost: 100, label: 'Pulse', aoe: true },
7: { color: '#FF7F50', range: 170, damage: 36,  fireRate: 1200, cost: 150, label: 'Launcher', pierce: 1, armorPen: 2 },
8: { color: '#64E6FF', range: 100, damage: 20,  fireRate: 700,  cost: 250, label: 'Tesla', armorPen: 1, pierce: 1 },
9: { color: '#6aa8ff', range: 140, damage: 20, fireRate: 1500, cost: 240, label: 'Tempest', },
10: { color: '#7ee26a', range: 0, damage: 0, fireRate: 2300, cost: 260, label: 'Bank' },
11: { color: '#aeb9c7', range: 250, damage: 0, fireRate: 1000, cost: 150, label: 'Radar' },
};

const TOWER_SPECIALS = {
1: { name: 'Squad Link', max: 3, desc: '+1 extra target per shot' },
2: { name: 'AP Shells', max: 3, desc: '+4 armor penetration' },
3: { name: 'Deadeye', max: 2, desc: '+1 pierce and faster reload' },
4: { name: 'Twin Barrels', max: 2, desc: '+2 extra targets per shot' },
5: { name: 'Deep Freeze', max: 3, desc: 'Stronger and longer slow' },
6: { name: 'Overcharge', max: 3, desc: '+range and +damage pulse' },
7: { name: 'Shrapnel Core', max: 3, desc: '+1 target and +2 armor pen' },
8: { name: 'Ion Core', max: 2, desc: '+damage and faster fire rate' },
9: { name: 'Maelstrom Core', max: 2, desc: 'More pulses and targets, slightly wider storm' },
10: { name: 'Compound Interest', max: 3, desc: '+income per payout and faster payout rate' },
11: { name: 'Signal Amplifier', max: 3, desc: '+radar range for stealth reveal' },
};

// ================= ENEMY DEFINITIES =================
// type: { color, hpMult, speedMult, rewardMult, armor, slowImmune }
const ENEMY_DEFS = {
    basic:   { color: '#4f7340', hpMult: 1.0, speedMult: 1.0, rewardMult: 1.0, armor: 0    },
    fast:    { color: '#f1c40f', hpMult: 0.5, speedMult: 2.5, rewardMult: 0.8, armor: 0    },
    tank:    { color: '#8e44ad', hpMult: 3.5, speedMult: 0.5, rewardMult: 2.5, armor: 2    },
    armored: { color: '#95a5a6', hpMult: 1.5, speedMult: 0.8, rewardMult: 1.8, armor: 8    },
    boss:    { color: '#2c3e50', hpMult: 11.0, speedMult: 0.45, rewardMult: 8.0, armor: 14 },
    stealth: { color: '#7f8c8d', hpMult: 1.2, speedMult: 1.15, rewardMult: 1.7, armor: 1, stealth: true },
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
    paused: false,
};

let damageTexts = [];
let pulseEffects = [];
let lightningEffects = [];
let electricGates = [];
let tempestZones = [];

const TESLA_CHAIN_MAX_TARGETS = 3;
const TESLA_CHAIN_FALLOFF = 0.7;
const TESLA_CHAIN_JUMP_RANGE = 50;
const TESLA_LIGHTNING_LIFE = 5;
const TESLA_STUN_DURATION = 100;
const TESLA_STORM_MIN_TOWERS = 2;
const TESLA_STORM_COOLDOWN = 30000;
const TESLA_STORM_DAMAGE = 80;
const TESLA_STORM_STUN_DURATION = 1600;
const TESLA_GATE_DURATION = 3000;
const TESLA_GATE_DPS = 55;
const TESLA_GATE_HALF_WIDTH = 16;
const TESLA_GATE_TICK_MS = 250;
const BANK_RAIN_MIN_TOWERS = 2;
const BANK_RAIN_COOLDOWN = 35000;
const BANK_RAIN_OVERDRIVE_MS = 12000;
const BARRAGE_MIN_TOWERS = 2;
const BARRAGE_COOLDOWN = 28000;
const BARRAGE_DAMAGE = 95;
const BARRAGE_RADIUS = 70;
const TEMPEST_ZONE_ARM_MS = 320;
const TEMPEST_ZONE_DURATION_MS = 1800;
const TEMPEST_ZONE_TICK_MS = 520;
const TEMPEST_ZONE_RADIUS = 50;
let suppressNextCanvasClick = false;
let teslaStormLastCast = -TESLA_STORM_COOLDOWN;
let bankRainLastCast = -BANK_RAIN_COOLDOWN;
let barrageLastCast = -BARRAGE_COOLDOWN;
let bankOverdriveUntil = 0;

function roundTo(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function drawTowerVolume(x, y, radius, height, topColor, sideColor, ringColor) {
    const topW = radius * 1.3;
    const topH = radius * 0.45;
    const topY = y - height;

    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(x - topW, topY);
    ctx.lineTo(x - topW, y - topH * 0.2);
    ctx.quadraticCurveTo(x, y + topH * 0.4, x + topW, y - topH * 0.2);
    ctx.lineTo(x + topW, topY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.ellipse(x, topY, topW, topH, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ringColor) {
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, topY, topW * 0.68, topH * 0.68, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawEnemyVolume(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.9, r * 1.2, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.15, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
}

// ================= PAD =================
const path = [
    {x: 0, y: 7}, {x: 4, y: 7}, {x: 4, y: 3}, {x: 8, y: 3},
    {x: 8, y: 10}, {x: 12, y: 10}, {x: 12, y: 5}, {x: 16, y: 5},
    {x: 16, y: 12}, {x: 19, y: 12}
];

function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#8bd8ff');
    bg.addColorStop(0.45, '#5ad07f');
    bg.addColorStop(1, '#2ea65f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // kleurvlekken voor extra levendigheid
    const accentA = ctx.createRadialGradient(140, 90, 20, 140, 90, 230);
    accentA.addColorStop(0, 'rgba(255, 235, 110, 0.22)');
    accentA.addColorStop(1, 'rgba(255, 235, 110, 0)');
    ctx.fillStyle = accentA;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const accentB = ctx.createRadialGradient(870, 120, 20, 870, 120, 230);
    accentB.addColorStop(0, 'rgba(115, 210, 255, 0.2)');
    accentB.addColorStop(1, 'rgba(115, 210, 255, 0)');
    ctx.fillStyle = accentB;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // zachte heuvels voor diepte
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(190, 560, 230, Math.PI, Math.PI * 2);
    ctx.arc(560, 580, 270, Math.PI, Math.PI * 2);
    ctx.arc(890, 560, 200, Math.PI, Math.PI * 2);
    ctx.fill();

    // subtiele tegel-grid
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
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

// ── Don Bosco school at the end of the path (tile 19,12 → pixel 780,500) ──
let _schoolFrame = 0;
function drawSchoolInGame() {
    _schoolFrame++;
    const TAU = Math.PI * 2;

    // End of path: tile (19,12) → pixel (780, 500)
    // Place school centered just beyond that point
    const sx = 19 * TILE_SIZE + 20;   // 780
    const sy = 12 * TILE_SIZE + 20;   // 500
    const s  = canvas.height / 600 * 0.95;

    const towerW = 50*s, towerH = 90*s, towerTh = 20*s;
    const wingW  = 70*s, wingH  = 50*s, wingTh  = 16*s;

    const tBase = sy, tTop = sy - towerH;
    const wBase = sy, wTop = sy - wingH;
    const tx = sx - 12*s;
    const wx = sx + 36*s;

    // ── Wing (lower right structure) ──
    ctx.fillStyle = '#7a5438';
    ctx.beginPath();
    ctx.moveTo(wx, wTop - wingTh*0.5); ctx.lineTo(wx+wingW, wTop);
    ctx.lineTo(wx, wTop + wingTh*0.5); ctx.lineTo(wx-wingW, wTop);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#5a3922';
    ctx.beginPath();
    ctx.moveTo(wx-wingW, wTop);    ctx.lineTo(wx, wTop+wingTh*0.5);
    ctx.lineTo(wx, wBase+wingTh*0.5); ctx.lineTo(wx-wingW, wBase);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#8c6040';
    ctx.beginPath();
    ctx.moveTo(wx+wingW, wTop);    ctx.lineTo(wx, wTop+wingTh*0.5);
    ctx.lineTo(wx, wBase+wingTh*0.5); ctx.lineTo(wx+wingW, wBase);
    ctx.closePath(); ctx.fill();

    // Wing brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8;
    for (let row = 1; row < 5; row++) {
        ctx.beginPath();
        ctx.moveTo(wx-wingW, wBase - (row/5)*wingH);
        ctx.lineTo(wx,       wBase - (row/5)*wingH + wingTh*0.5);
        ctx.stroke();
    }

    // Wing windows
    ctx.fillStyle = 'rgba(255,210,140,0.55)';
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
            const wy2 = wBase - wingH*0.78 + row*wingH*0.34;
            const wx2 = wx - wingW + ((col+0.5)/3)*wingW + row*wingTh*0.1;
            ctx.fillRect(wx2 - 4*s, wy2, 7*s, 9*s);
        }
    }

    // Billboard on wing
    const billX = wx + wingW*0.35, billY = wTop + wingTh*0.8;
    ctx.fillStyle = 'rgba(220,230,240,0.88)';
    ctx.fillRect(billX - 14*s, billY, 20*s, 18*s);
    ctx.strokeStyle = '#a08060'; ctx.lineWidth = 0.8;
    ctx.strokeRect(billX - 14*s, billY, 20*s, 18*s);
    ctx.fillStyle = 'rgba(40,60,80,0.8)';
    ctx.font = `bold ${4*s}px Arial`; ctx.textAlign = 'center';
    ctx.fillText('DON BOSCO', billX - 4*s, billY + 5*s);
    ctx.font = `${2.5*s}px Arial`;
    ctx.fillText('GENT', billX - 4*s, billY + 9*s);
    ctx.fillText('VTM-opleiding', billX - 4*s, billY + 13*s);

    // ── Main tall tower ──
    ctx.fillStyle = '#8c5a35';
    ctx.beginPath();
    ctx.moveTo(tx, tTop - towerTh*0.5); ctx.lineTo(tx+towerW, tTop);
    ctx.lineTo(tx, tTop + towerTh*0.5); ctx.lineTo(tx-towerW, tTop);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b07848'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tx, tTop-towerTh*0.5); ctx.lineTo(tx+towerW, tTop);
    ctx.lineTo(tx, tTop+towerTh*0.5); ctx.lineTo(tx-towerW, tTop);
    ctx.closePath(); ctx.stroke();

    // Tower left wall
    ctx.fillStyle = '#5a3520';
    ctx.beginPath();
    ctx.moveTo(tx-towerW, tTop); ctx.lineTo(tx, tTop+towerTh*0.5);
    ctx.lineTo(tx, tBase+towerTh*0.5); ctx.lineTo(tx-towerW, tBase);
    ctx.closePath(); ctx.fill();

    // Tower right wall
    ctx.fillStyle = '#7a4c2e';
    ctx.beginPath();
    ctx.moveTo(tx+towerW, tTop); ctx.lineTo(tx, tTop+towerTh*0.5);
    ctx.lineTo(tx, tBase+towerTh*0.5); ctx.lineTo(tx+towerW, tBase);
    ctx.closePath(); ctx.fill();

    // Vertical concrete strip
    const stripRX = tx + towerW*0.72, stripLX = tx + towerW*0.44;
    ctx.fillStyle = '#d8dfe6';
    ctx.beginPath();
    ctx.moveTo(stripLX, tTop + towerTh*(0.5-(stripLX-tx)/(towerW*2)));
    ctx.lineTo(stripRX, tTop + towerTh*(0.5-(stripRX-tx)/(towerW*2)));
    ctx.lineTo(stripRX, tBase + towerTh*(0.5-(stripRX-tx)/(towerW*2)));
    ctx.lineTo(stripLX, tBase + towerTh*(0.5-(stripLX-tx)/(towerW*2)));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(stripLX, tTop  + towerTh*(0.5-(stripLX-tx)/(towerW*2)));
    ctx.lineTo(stripLX, tBase + towerTh*(0.5-(stripLX-tx)/(towerW*2)));
    ctx.stroke();

    // Brick texture on tower left wall
    ctx.strokeStyle = 'rgba(30,15,5,0.14)'; ctx.lineWidth = 0.7;
    for (let row = 1; row < 7; row++) {
        const fy = tBase - (row/7)*towerH;
        ctx.beginPath();
        ctx.moveTo(tx-towerW, fy); ctx.lineTo(tx, fy + towerTh*0.5); ctx.stroke();
    }

    // Tower windows (4 floors × 2 cols on right wall)
    ctx.fillStyle = 'rgba(255,215,160,0.62)';
    for (let floor = 0; floor < 4; floor++) {
        for (let col = 0; col < 2; col++) {
            const progressX = (col+0.4)/2;
            const wx3 = tx + (progressX - 0.5)*towerW*2*0.65;
            const wy3 = tBase - towerH*0.85 + floor*(towerH*0.19);
            const isoSkew = (wx3 - tx) / (towerW*2) * towerTh;
            ctx.fillRect(wx3 - 5*s, wy3 + isoSkew*0.5, 8*s, 10*s);
        }
    }
    // Left wall windows
    ctx.fillStyle = 'rgba(200,170,120,0.45)';
    for (let floor = 0; floor < 3; floor++) {
        const wx4 = tx - towerW*0.55;
        const wy4 = tBase - towerH*0.8 + floor*(towerH*0.22);
        ctx.fillRect(wx4 - 4*s, wy4, 7*s, 10*s);
    }

    // "DON BOSCO" lettering on left tower wall
    // Target position on the wall (no setTransform — use save/translate/restore)
    const textX = tx - towerW * 0.78;
    const textY = tBase - towerH * 0.5 + towerTh * 0.2;
    ctx.save();
    ctx.translate(textX, textY);
    ctx.transform(1, 0.12, 0, 1, 0, 0);   // slight iso skew, relative to textX/textY
    ctx.fillStyle = 'rgba(240,230,210,0.9)';
    ctx.font = `bold ${7*s}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText('DON BOSCO', 0, 0);
    ctx.restore();

    // Roof parapet
    ctx.strokeStyle = 'rgba(200,160,100,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx-towerW, tTop); ctx.lineTo(tx, tTop-towerTh*0.5);
    ctx.lineTo(tx+towerW, tTop); ctx.lineTo(tx, tTop+towerTh*0.5);
    ctx.closePath(); ctx.stroke();

    // Chimney
    ctx.fillStyle = '#5a3520';
    const chx = tx + towerW*0.15, chy = tTop - towerTh*0.3;
    ctx.fillRect(chx - 3*s, chy - 14*s, 6*s, 14*s);
    ctx.fillStyle = '#7a4c2e';
    ctx.fillRect(chx - 2*s, chy - 15*s, 4*s, 3*s);

    // Warm window glow pulse
    ctx.globalAlpha = 0.10 + 0.05 * Math.sin(_schoolFrame * 0.05);
    const winGlow = ctx.createRadialGradient(tx, sy - towerH*0.5, 5, tx, sy - towerH*0.5, 55*s);
    winGlow.addColorStop(0, 'rgba(255,200,100,0.7)');
    winGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = winGlow;
    ctx.beginPath(); ctx.arc(tx, sy - towerH*0.5, 55*s, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left'; // reset
}

function drawPath() {
    const startX = path[0].x * TILE_SIZE + 20;
    const startY = path[0].y * TILE_SIZE + 20;

    // buitenrand
    ctx.strokeStyle = '#73421b';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * TILE_SIZE + 20, path[i].y * TILE_SIZE + 20);
    }
    ctx.stroke();

    // hoofdweg
    ctx.strokeStyle = '#d87a2c';
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * TILE_SIZE + 20, path[i].y * TILE_SIZE + 20);
    }
    ctx.stroke();

    // middenlijn
    ctx.strokeStyle = 'rgba(255, 214, 94, 0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * TILE_SIZE + 20, path[i].y * TILE_SIZE + 20);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

function formatLives(lives) {
    if (lives <= 0) return '0';
    const visibleHearts = Math.min(1, lives);
    const hearts = '\u2665'.repeat(visibleHearts);
    return lives > 0 ? `${hearts} x${lives}` : hearts;
}

// ================= TOWER =================
class Tower {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;

        const def = TOWER_DEFS[type];
        this.color      = def.color;
        this.range      = Math.round(def.range);
        this.damage     = Math.round(def.damage);
        this.fireRate   = Math.round(def.fireRate);
        this.isAoe      = !!def.aoe;
        this.pierce     = def.pierce || 0;
        this.extraPierce = 0;
        this.projectilesPerShot = 1;
        this.armorPen = def.armorPen || 0;
        this.slowDuration = 1500;
        this.slowFactor = 0.35;
        this.specialLevel = 0;
        this.level      = 1;
        this.upgradeCost = def.cost;

        this.lastShot = 0;
        this.target   = null;
        this.isCharging = false;
        this.chargeStart = 0;
        this.chargeDuration = this.type === 8 ? 240 : 0;
        this.tempestRadius = this.type === 9 ? TEMPEST_ZONE_RADIUS : 0;
        this.tempestTickMs = this.type === 9 ? TEMPEST_ZONE_TICK_MS : 0;
        this.tempestDurationMs = this.type === 9 ? TEMPEST_ZONE_DURATION_MS : 0;
        this.tempestSlowFactor = this.type === 9 ? 0.98 : 1;
        this.tempestMaxTargets = this.type === 9 ? 3 : 0;
        this.tempestPulseDamageScale = this.type === 9 ? 0.85 : 1;
        this.bankIncome = this.type === 10 ? 25 : 0;
    }

    update(delta) {
        const now = Date.now();

        if (this.isAoe) {
            const enemiesInRange = this.getEnemiesInRange();
            if (enemiesInRange.length > 0 && now - this.lastShot > this.fireRate / gameSpeed) {
                this.pulse(enemiesInRange);
                this.lastShot = now;
            }
            return;
        }

        this.findTarget();
        if (this.type === 10) {
            if (gameState.waveActive == false) return;
            if (now - this.lastShot > this.fireRate / gameSpeed) {
                const payout = Math.round(this.bankIncome * (Date.now() < bankOverdriveUntil ? 2 : 1));
                gameState.gold += payout;
                damageTexts.push({
                    x: this.x,
                    y: this.y - 16,
                    text: `+$${payout}`,
                    life: 32,
                    color: '#a8ff9c',
                });
                this.lastShot = now;
            }
            return;
        }
        if (this.type === 11) {
            return;
        }

        if (this.type === 9) {
            this.updateTempest(now);
            return;
        }

        if (this.type === 8) {
            if (!this.target) {
                this.isCharging = false;
                return;
            }

            if (!this.isCharging && now - this.lastShot > this.fireRate / gameSpeed) {
                this.isCharging = true;
                this.chargeStart = now;
            }

            if (this.isCharging && now - this.chargeStart >= this.chargeDuration / gameSpeed) {
                this.shoot();
                this.lastShot = now;
                this.isCharging = false;
            }
            return;
        }

        if (this.target && now - this.lastShot > this.fireRate / gameSpeed) {
            this.shoot();
            this.lastShot = now;
        }
    }

    updateTempest(now) {
        if (!this.target) return;
        if (now - this.lastShot <= this.fireRate / gameSpeed) return;

        tempestZones.push({
            x: this.target.x,
            y: this.target.y,
            radius: this.tempestRadius,
            owner: this,
            createdAt: now,
            armedAt: now + TEMPEST_ZONE_ARM_MS,
            expiresAt: now + TEMPEST_ZONE_ARM_MS + this.tempestDurationMs,
            nextTickAt: now + TEMPEST_ZONE_ARM_MS,
            pulsesLeft: Math.max(1, Math.floor(this.tempestDurationMs / this.tempestTickMs)),
        });
        this.lastShot = now;
    }


    getEnemiesInRange() {
        return gameState.enemies.filter(e => isEnemyTargetable(e) && Math.hypot(this.x - e.x, this.y - e.y) < this.range);
    }

    findTarget() {
        this.target = null;
        let closest = Infinity;
        for (let e of gameState.enemies) {
            if (!isEnemyTargetable(e)) continue;
            const d = Math.hypot(this.x - e.x, this.y - e.y);
            if (d < this.range && d < closest) {
                closest = d;
                this.target = e;
            }
        }
    }

    shoot() {
        if (this.type === 10) return;
        if (this.type === 8) {
            this.shootTeslaChain();
            return;
        }

        const targets = this.getEnemiesInRange()
            .sort((a, b) => Math.hypot(this.x - a.x, this.y - a.y) - Math.hypot(this.x - b.x, this.y - b.y))
            .slice(0, this.projectilesPerShot);
        if (targets.length === 0) return;

        for (let target of targets) {
            gameState.projectiles.push(
                new Projectile(
                    this.x,
                    this.y,
                    target,
                    this.damage,
                    this.type,
                    this.color,
                    this.pierce + this.extraPierce,
                    this.armorPen,
                    this.slowDuration,
                    this.slowFactor
                )
            );
        }
    }

    shootTeslaChain() {
        const inRange = this.getEnemiesInRange()
            .filter(enemy => enemy.health > 0)
            .sort((a, b) => Math.hypot(this.x - a.x, this.y - a.y) - Math.hypot(this.x - b.x, this.y - b.y));
        if (inRange.length === 0) return;

        const used = new Set();
        let current = inRange[0];
        let fromX = this.x;
        let fromY = this.y;

        for (let jump = 0; jump < TESLA_CHAIN_MAX_TARGETS && current; jump++) {
            used.add(current);

            const multiplier = Math.pow(TESLA_CHAIN_FALLOFF, jump);
            const actual = current.takeDamage(Math.round(this.damage * multiplier), this.armorPen);
            current.stunUntil = Math.max(current.stunUntil || 0, Date.now() + TESLA_STUN_DURATION);
            damageTexts.push({
                x: current.x,
                y: current.y - 10,
                text: actual,
                life: 40,
                color: '#8defff',
            });

            lightningEffects.push({
                points: createLightningPath(fromX, fromY, current.x, current.y, 16, 14),
                life: TESLA_LIGHTNING_LIFE,
                maxLife: TESLA_LIGHTNING_LIFE,
            });

            fromX = current.x;
            fromY = current.y;

            if (jump >= TESLA_CHAIN_MAX_TARGETS - 1) break;

            const next = gameState.enemies
                .filter(enemy => enemy.health > 0 && !used.has(enemy) && Math.hypot(enemy.x - fromX, enemy.y - fromY) <= TESLA_CHAIN_JUMP_RANGE)
                .sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY))[0];

            current = next || null;
        }
    }

    pulse(enemiesInRange) {
        pulseEffects.push({
            x: this.x,
            y: this.y,
            maxRadius: this.range,
            life: 28,
            maxLife: 28,
            color: this.color
        });

        for (let enemy of enemiesInRange) {
            const actual = enemy.takeDamage(this.damage, this.armorPen);
            damageTexts.push({
                x: enemy.x,
                y: enemy.y - 10,
                text: actual,
                life: 40,
                color: this.color,
            });
            // Apply slow effect for Freeze tower
            if (this.type === 5) {
                enemy.slowUntil = Date.now() + this.slowDuration;
                enemy.slowFactor = this.slowFactor;
            }
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
        drawTowerVolume(this.x, this.y + 6, 16, 10, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.14)', 'rgba(255,255,255,0.12)');

        if (this.type === 1) {
            // Basic: armoured turret — hexagonal base plate, layered dome, glowing ring, fat barrel
            const pulse = 0.5 + 0.5 * Math.sin(now / 200);

            // hex base plate
            ctx.fillStyle = '#1c3a52';
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                i === 0 ? ctx.moveTo(this.x + Math.cos(a) * 17, this.y + Math.sin(a) * 17)
                        : ctx.lineTo(this.x + Math.cos(a) * 17, this.y + Math.sin(a) * 17);
            }
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#3a7aaa'; ctx.lineWidth = 1.2;
            ctx.stroke();

            // outer ring glow
            ctx.strokeStyle = `rgba(0,180,255,${0.28 + pulse * 0.22})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 17, 0, Math.PI * 2);
            ctx.stroke();

            // dome body with gradient
            const domeGrad = ctx.createRadialGradient(this.x - 4, this.y - 4, 2, this.x, this.y, 13);
            domeGrad.addColorStop(0, '#5ab8e8');
            domeGrad.addColorStop(0.5, '#1f6fa8');
            domeGrad.addColorStop(1, '#0d3a5c');
            ctx.fillStyle = domeGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 13, 0, Math.PI * 2);
            ctx.fill();

            // dome highlight arc
            ctx.strokeStyle = 'rgba(180,235,255,0.7)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(this.x - 2, this.y - 2, 9, Math.PI * 1.1, Math.PI * 1.85);
            ctx.stroke();

            // inner pulse ring
            ctx.strokeStyle = `rgba(100,210,255,${0.4 + pulse * 0.5})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 6 + pulse * 1.5, 0, Math.PI * 2);
            ctx.stroke();

            // barrel — wider, with muzzle ring and recoil hint
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            // barrel housing
            ctx.fillStyle = '#0e1d2a';
            ctx.beginPath();
            ctx.roundRect(1, -4, 18, 8, 2);
            ctx.fill();
            // barrel highlight stripe
            ctx.fillStyle = '#2a5878';
            ctx.fillRect(2, -3, 16, 2);
            // muzzle brake
            ctx.fillStyle = '#00BFFF';
            ctx.fillRect(17, -3.5, 5, 7);
            ctx.strokeStyle = 'rgba(0,190,255,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(17, -3.5, 5, 7);
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
        } else if (this.type === 7) {
            // Launcher: heavy artillery — reinforced octagonal base, chunky rotating platform, thick barrel with blast ring
            const pulse = 0.5 + 0.5 * Math.sin(now / 300);
            const timeSinceShot = now - this.lastShot;
            const recoil = timeSinceShot < 120 ? (1 - timeSinceShot / 120) * 5 : 0;

            // octagonal base
            ctx.fillStyle = '#3a1e0c';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
                i === 0 ? ctx.moveTo(this.x + Math.cos(a) * 17, this.y + Math.sin(a) * 17)
                        : ctx.lineTo(this.x + Math.cos(a) * 17, this.y + Math.sin(a) * 17);
            }
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#b05a28'; ctx.lineWidth = 1.4;
            ctx.stroke();

            // outer orange glow ring
            ctx.strokeStyle = `rgba(255,130,40,${0.2 + pulse * 0.25})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 17, 0, Math.PI * 2);
            ctx.stroke();

            // turret body — dark armoured circle
            const turretGrad = ctx.createRadialGradient(this.x - 3, this.y - 3, 2, this.x, this.y, 13);
            turretGrad.addColorStop(0, '#b06030');
            turretGrad.addColorStop(0.5, '#7a3a18');
            turretGrad.addColorStop(1, '#3a1a08');
            ctx.fillStyle = turretGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 13, 0, Math.PI * 2);
            ctx.fill();

            // 4 vent slots around turret
            for (let i = 0; i < 4; i++) {
                const va = angle + (i / 4) * Math.PI * 2 + Math.PI / 8;
                const vx = this.x + Math.cos(va) * 9;
                const vy = this.y + Math.sin(va) * 9;
                ctx.save();
                ctx.translate(vx, vy);
                ctx.rotate(va);
                ctx.fillStyle = 'rgba(255,100,20,0.5)';
                ctx.fillRect(-4, -1.5, 8, 3);
                ctx.restore();
            }

            // dome highlight
            ctx.strokeStyle = 'rgba(220,140,60,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x - 2, this.y - 2, 9, Math.PI * 1.1, Math.PI * 1.8);
            ctx.stroke();

            // barrel — thick, with recoil offset and muzzle blast ring
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            // barrel body (recoil pulls it back)
            ctx.fillStyle = '#1a0e06';
            ctx.beginPath();
            ctx.roundRect(-recoil, -5.5, 22, 11, 2);
            ctx.fill();
            // reinforcement bands
            ctx.fillStyle = '#6a3418';
            ctx.fillRect(4 - recoil, -5.5, 3, 11);
            ctx.fillRect(10 - recoil, -5.5, 3, 11);
            // muzzle tip — orange glow
            ctx.fillStyle = '#ff7a30';
            ctx.beginPath();
            ctx.roundRect(20 - recoil, -4.5, 7, 9, 1.5);
            ctx.fill();
            // muzzle glow halo
            ctx.globalAlpha = 0.35 + pulse * 0.3;
            const muzzleGlow = ctx.createRadialGradient(24 - recoil, 0, 1, 24 - recoil, 0, 10);
            muzzleGlow.addColorStop(0, 'rgba(255,160,40,0.9)');
            muzzleGlow.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = muzzleGlow;
            ctx.beginPath();
            ctx.arc(24 - recoil, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        } else if (this.type === 8) {
            // Tesla: coil emitter
            const pulse = 0.5 + 0.5 * Math.sin(now / 150);
            const chargeProgress = this.isCharging
                ? Math.min(1, (now - this.chargeStart) / this.chargeDuration)
                : 0;
            ctx.fillStyle = '#103f56';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#89eeff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#d6fbff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4 + pulse * 2.5 + chargeProgress * 1.6, 0, Math.PI * 2);
            ctx.fill();

            // subtle visual refresh: dual coil ring + top nodes
            ctx.strokeStyle = 'rgba(80,200,220,0.65)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 7.5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(100,230,255,${0.4 + pulse * 0.5 + chargeProgress * 0.15})`;
            ctx.lineWidth = 2 + chargeProgress * 0.8;
            for (let i = 0; i < 4; i++) {
                const a = angle + i * (Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(a) * 7, this.y + Math.sin(a) * 7);
                ctx.lineTo(this.x + Math.cos(a) * 15, this.y + Math.sin(a) * 15);
                ctx.stroke();

                ctx.fillStyle = 'rgba(200,255,255,0.85)';
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(a) * 15, this.y + Math.sin(a) * 15, 1.7, 0, Math.PI * 2);
                ctx.fill();
            }

            // charge-up animation before firing
            if (this.isCharging) {
                const ringRadius = 15 + chargeProgress * 10;
                const ringAlpha = 0.22 + chargeProgress * 0.35;
                const sparkAlpha = 0.3 + chargeProgress * 0.6;

                ctx.strokeStyle = `rgba(160,250,255,${ringAlpha})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
                ctx.stroke();

                const spin = now / 120;
                for (let i = 0; i < 3; i++) {
                    const sa = spin + (i * Math.PI * 2) / 3;
                    const sx = this.x + Math.cos(sa) * (9 + chargeProgress * 7);
                    const sy = this.y + Math.sin(sa) * (9 + chargeProgress * 7);
                    ctx.strokeStyle = `rgba(220,255,255,${sparkAlpha})`;
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(this.x + Math.cos(sa) * 5, this.y + Math.sin(sa) * 5);
                    ctx.lineTo(sx, sy);
                    ctx.stroke();
                }
            }
        } else if (this.type === 9) {
            // Tempest: floating storm obelisk
            const spin = now / 350;
            const pulse = 0.5 + 0.5 * Math.sin(now / 220);
            ctx.fillStyle = '#132946';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#74c6ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 12, 0, Math.PI * 2);
            ctx.stroke();

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(spin);
            for (let i = 0; i < 3; i++) {
                ctx.rotate((Math.PI * 2) / 3);
                ctx.fillStyle = 'rgba(178,232,255,0.8)';
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.lineTo(4, -3);
                ctx.lineTo(-4, -3);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();

            ctx.fillStyle = `rgba(214,245,255,${0.55 + pulse * 0.35})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4 + pulse * 2.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 10) {
            // Bank: vault building
            const pulse = 0.5 + 0.5 * Math.sin(now / 280);
            ctx.fillStyle = '#2f5a2e';
            ctx.fillRect(this.x - 15, this.y - 15, 30, 30);
            ctx.fillStyle = '#4b8a3f';
            ctx.fillRect(this.x - 11, this.y - 11, 22, 22);
            ctx.strokeStyle = '#d7ffc8';
            ctx.lineWidth = 1.4;
            ctx.strokeRect(this.x - 11, this.y - 11, 22, 22);
            ctx.fillStyle = '#d8ffc8';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 5.5 + pulse * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2f5a2e';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('$', this.x, this.y + 3);
        } else if (this.type === 11) {
            // Radar: scanning dish
            const sweep = now / 420;
            ctx.fillStyle = '#384552';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#aebdcc';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#e0ebf7';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + Math.cos(sweep) * 14, this.y + Math.sin(sweep) * 14);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(180,210,240,0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 16 + Math.sin(now / 180) * 1.5, 0, Math.PI * 2);
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

        this.health     = Math.max(1, Math.round(baseHp * def.hpMult));
        this.maxHealth  = this.health;
        this.speed      = roundTo(baseSpeed * def.speedMult, 3);
        this.reward     = Math.round(baseReward * def.rewardMult);
        this.stealth    = !!def.stealth;
        this.revealedUntil = this.stealth ? 0 : Date.now() + 99999999;

        this.rewardGiven = false;

        // slow systeem
        this.slowUntil  = 0;
        this.slowFactor = 1;
        this.stunUntil  = 0;
        this.burnUntil  = 0;
        this.burnDps    = 0;
        this.burnTickMs = 0;
        this.armorBreakUntil = 0;
        this.armorBreakAmount = 0;
    }

    update(delta) {
        if (Date.now() < this.burnUntil && this.burnDps > 0) {
            this.burnTickMs += delta * 16.67;
            while (this.burnTickMs >= 250) {
                this.burnTickMs -= 250;
                const burnDamage = Math.max(1, Math.round(this.burnDps * 0.25));
                this.health = Math.max(0, this.health - burnDamage);
                damageTexts.push({
                    x: this.x,
                    y: this.y - 16,
                    text: burnDamage,
                    life: 20,
                    color: '#ff7a1f',
                });
            }
        } else {
            this.burnTickMs = 0;
        }

        if (Date.now() < this.stunUntil) {
            return true;
        }

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

    takeDamage(dmg, armorPen = 0) {
        const fracturedArmor = Date.now() < this.armorBreakUntil ? this.armorBreakAmount : 0;
        const effectiveArmor = Math.max(0, this.armor - armorPen - fracturedArmor);
        const actual = Math.max(1, Math.round(dmg - effectiveArmor));
        this.health = Math.max(0, this.health - actual);
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

        drawEnemyVolume(this.x, y, r);

        // slow effect: blauwe gloed
        if (Date.now() < this.slowUntil) {
            ctx.fillStyle = 'rgba(100,180,255,0.28)';
            ctx.beginPath();
            ctx.arc(this.x, y, r + 6, 0, Math.PI * 2);
            ctx.fill();
        }

        if (Date.now() < this.burnUntil) {
            for (let i = 0; i < 3; i++) {
                const fa = now / 120 + i * ((Math.PI * 2) / 3);
                const fx = this.x + Math.cos(fa) * (r * 0.55);
                const fy = y + Math.sin(fa) * (r * 0.4) - 2;
                ctx.fillStyle = i % 2 === 0 ? 'rgba(255,170,60,0.9)' : 'rgba(255,95,40,0.85)';
                ctx.beginPath();
                ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // stun effect: electrocuted arcs
        if (Date.now() < this.stunUntil) {
            const phase = now / 110;
            const arcCount = 3;
            for (let i = 0; i < arcCount; i++) {
                const baseA = phase + i * ((Math.PI * 2) / arcCount);
                const a1 = baseA + Math.sin(phase + i) * 0.25;
                const a2 = a1 + 0.28;
                const a3 = a2 + 0.28;
                const innerR = r + 1;
                const outerR = r + 8;
                const midR = r + 4.5 + Math.sin(phase * 1.6 + i) * 1.2;

                const x1 = this.x + Math.cos(a1) * innerR;
                const y1 = y + Math.sin(a1) * innerR;
                const x2 = this.x + Math.cos(a2) * midR;
                const y2 = y + Math.sin(a2) * midR;
                const x3 = this.x + Math.cos(a3) * outerR;
                const y3 = y + Math.sin(a3) * outerR;

                ctx.strokeStyle = 'rgba(210,255,255,0.95)';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.lineTo(x3, y3);
                ctx.stroke();
            }
        }

        if (Date.now() < this.armorBreakUntil) {
            ctx.strokeStyle = 'rgba(190,255,160,0.9)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(this.x, y, r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (this.type === 'stealth') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            const cloaked = !isEnemyVisible(this);
            ctx.globalAlpha = cloaked ? 0.45 : 1;

            // B-2 Spirit style flying wing silhouette
            const wingGrad = ctx.createLinearGradient(-24, -10, 24, 10);
            wingGrad.addColorStop(0, '#858e97');
            wingGrad.addColorStop(1, '#262c32');
            ctx.fillStyle = wingGrad;
            ctx.beginPath();
            ctx.moveTo(18, 0);
            ctx.lineTo(8, 4);
            ctx.lineTo(0, 7);
            ctx.lineTo(-10, 9);
            ctx.lineTo(-22, 4);
            ctx.lineTo(-18, 0);
            ctx.lineTo(-22, -4);
            ctx.lineTo(-10, -9);
            ctx.lineTo(0, -7);
            ctx.lineTo(8, -4);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#222930';
            ctx.beginPath();
            ctx.moveTo(3, 0);
            ctx.lineTo(-4, 3.2);
            ctx.lineTo(-11.5, 0);
            ctx.lineTo(-4, -3.2);
            ctx.closePath();
            ctx.fill();

            // sawtooth trailing edge hints
            ctx.strokeStyle = 'rgba(190,205,218,0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-18, -3);
            ctx.lineTo(-20.5, -1.5);
            ctx.lineTo(-18.8, 0);
            ctx.lineTo(-20.5, 1.5);
            ctx.lineTo(-18, 3);
            ctx.stroke();

            if (cloaked) {
                ctx.strokeStyle = 'rgba(190,220,255,0.55)';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        } else if (this.type === 'basic') {
            ctx.save();
            ctx.translate(this.x, y);
            ctx.rotate(dirA);

            const step = Math.sin(now / 120 + this.x * 0.07) * 0.8;

            // backpack
            ctx.fillStyle = '#324a2a';
            ctx.fillRect(-2.6, 2.2, 5.2, 4.8);

            // torso
            ctx.fillStyle = '#4f7340';
            ctx.fillRect(-4.6, -0.8, 9.2, 10);

            // vest plate
            ctx.fillStyle = '#3a5a2f';
            ctx.fillRect(-2.5, 1, 5, 5.2);

            // helmet
            ctx.fillStyle = '#6f8c57';
            ctx.beginPath();
            ctx.arc(0, -5.6, 3.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#405334';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(0, -5.6, 3.7, 0, Math.PI * 2);
            ctx.stroke();

            // visor highlight
            ctx.fillStyle = 'rgba(190,230,255,0.55)';
            ctx.fillRect(-1.9, -6.3, 3.8, 1.1);

            // arms
            ctx.fillStyle = '#5f8450';
            ctx.fillRect(-7.2, 0.2, 2.4, 5.5);
            ctx.fillRect(4.8, 0.2, 2.4, 5.5);

            // legs / boots
            ctx.fillStyle = '#2f4726';
            ctx.fillRect(-4.1 + step * 0.2, 8.6, 2.8, 3.2);
            ctx.fillRect(1.3 - step * 0.2, 8.6, 2.8, 3.2);
            ctx.fillStyle = '#232323';
            ctx.fillRect(-4.3 + step * 0.2, 11.1, 3.2, 1.6);
            ctx.fillRect(1.1 - step * 0.2, 11.1, 3.2, 1.6);

            // rifle
            ctx.fillStyle = '#2a2c2f';
            ctx.fillRect(3.4, -0.4, 10.2, 1.8);
            ctx.fillRect(11.8, -1.1, 1.5, 3.2);
            ctx.fillStyle = '#74532f';
            ctx.fillRect(1.6, -0.4, 2.4, 1.8);
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
    constructor(x, y, target, damage, towerType, color, pierce = 0, armorPen = 0, slowDuration = 1500, slowFactor = 0.25) {
        this.x          = x;
        this.y          = y;
        this.target     = target;
        this.damage     = damage;
        this.towerType  = towerType;
        this.color      = color;
        this.speed      = towerType === 3 ? 12 : towerType === 4 ? 9 : towerType === 8 ? 10 : towerType === 7 ? 6 : 7;
        this.pierceLeft = pierce + 1;
        this.hitEnemies = new Set();
        this.armorPen   = armorPen;
        this.slowDuration = slowDuration;
        this.slowFactor = slowFactor;
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
        if (!isEnemyTargetable(enemy)) return;
        const actual = enemy.takeDamage(this.damage, this.armorPen);

        damageTexts.push({
            x:    enemy.x,
            y:    enemy.y - 10,
            text: actual,
            life: 40,
            color: this.towerType === 5 ? '#BF5FFF' : 'yellow'
        });

        // slow toren vertraagt vijand 1.5 seconden
        if (this.towerType === 5) {
            enemy.slowUntil  = Date.now() + this.slowDuration;
            enemy.slowFactor = this.slowFactor;
        }
    }

    update(delta) {
        if (this.pierceLeft > 1) {
            this.x += this.vx * delta;
            this.y += this.vy * delta;

            for (let enemy of gameState.enemies) {
                if (!isEnemyTargetable(enemy)) continue;
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

        if (!this.target || !isEnemyTargetable(this.target)) return false;

        const dx   = this.target.x - this.x;
        const dy   = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        this.x += (dx / dist) * this.speed * delta;
        this.y += (dy / dist) * this.speed * delta;

        if (dist < 10) {
            this.dealHit(this.target);
            return false;
        }

        return true;
    }

    draw() {
        const size = this.towerType === 3 ? 5 : this.towerType === 4 ? 3 : 4;
        ctx.save();
        ctx.shadowBlur = this.towerType === 3 ? 12 : 8;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
            const armorChance   = wave >= 4 ? Math.min(0.20, (wave - 3) * 0.1) : 0;
            const stealthChance = wave >= 6 ? Math.min(0.18, (wave - 5) * 0.03) : 0;

            if (roll < stealthChance) {
                type = 'stealth';
            } else if (roll < stealthChance + armorChance) {
                type = 'armored';
            } else if (roll < stealthChance + armorChance + tankChance) {
                type = 'tank';
            } else if (roll < stealthChance + armorChance + tankChance + fastChance) {
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

function createLightningPath(fromX, fromY, toX, toY, segments = 14, jitter = 12) {
    const points = [{ x: fromX, y: fromY }];
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = fromX + dx * t;
        const baseY = fromY + dy * t;
        const envelope = 1 - Math.abs(0.5 - t) * 1.8;
        const offset = (Math.random() * 2 - 1) * jitter * Math.max(0.2, envelope);
        points.push({
            x: baseX + nx * offset,
            y: baseY + ny * offset,
        });
    }

    points.push({ x: toX, y: toY });
    return points;
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return Math.hypot(px - ax, py - ay);
    const apx = px - ax;
    const apy = py - ay;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}

function isEnemyVisible(enemy) {
    return !enemy.stealth || Date.now() < (enemy.revealedUntil || 0);
}

function isEnemyTargetable(enemy) {
    return enemy.health > 0 && isEnemyVisible(enemy);
}

function updateStealthReveals(now = Date.now()) {
    const radars = gameState.towers.filter(t => t.type === 11);
    for (const enemy of gameState.enemies) {
        if (!enemy.stealth) {
            enemy.revealedUntil = now + 50;
            continue;
        }

        let revealed = false;
        for (const radar of radars) {
            if (Math.hypot(enemy.x - radar.x, enemy.y - radar.y) <= radar.range) {
                revealed = true;
                break;
            }
        }

        if (revealed) enemy.revealedUntil = now + 120;
    }
}

// ================= WAVE SPAWNEN =================
function spawnWave() {
    if (gameState.waveActive || gameState.spawningWave) return;

    gameState.waveActive   = true;
    gameState.spawningWave = true;
    setWaveButton(false);

    const baseHp     = Math.round(25 * Math.pow(1.155, gameState.wave));
    const baseSpeed  = roundTo((0.8 + gameState.wave * 0.03) * gameSpeed, 3);
    const baseReward = 8 + gameState.wave * 2.5;

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
    }, 700 / gameSpeed);
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

function getTeslaTowerCount() {
    return gameState.towers.filter(t => t.type === 8).length;
}

function getBankTowerCount() {
    return gameState.towers.filter(t => t.type === 10).length;
}

function getLauncherTowerCount() {
    return gameState.towers.filter(t => t.type === 7).length;
}

function getTeslaStormCooldownLeft() {
    return Math.max(0, (TESLA_STORM_COOLDOWN / gameSpeed) - (Date.now() - teslaStormLastCast));
}

function getBankRainCooldownLeft() {
    return Math.max(0, (BANK_RAIN_COOLDOWN / gameSpeed) - (Date.now() - bankRainLastCast));
}

function getBarrageCooldownLeft() {
    return Math.max(0, (BARRAGE_COOLDOWN / gameSpeed) - (Date.now() - barrageLastCast));
}

function buildTeslaGatePairs(teslaTowers) {
    const unused = new Set(teslaTowers);
    const pairs = [];

    while (unused.size >= 2) {
        const a = unused.values().next().value;
        unused.delete(a);

        let closest = null;
        let closestDist = Infinity;

        for (const b of unused) {
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < closestDist) {
                closestDist = dist;
                closest = b;
            }
        }

        if (!closest) break;
        unused.delete(closest);
        pairs.push([a, closest]);
    }

    return pairs;
}

function castTeslaStorm() {
    if (gameState.gameOver) return;
    const teslaTowers = gameState.towers.filter(t => t.type === 8);
    if (teslaTowers.length < TESLA_STORM_MIN_TOWERS) return;
    if (getTeslaStormCooldownLeft() > 0) return;

    const aliveEnemies = gameState.enemies.filter(enemy => enemy.health > 0);
    if (aliveEnemies.length === 0) return;

    teslaStormLastCast = Date.now();

    for (const enemy of aliveEnemies) {
        const source = teslaTowers[Math.floor(Math.random() * teslaTowers.length)];
        const actual = enemy.takeDamage(TESLA_STORM_DAMAGE, 6);
        enemy.stunUntil = Math.max(enemy.stunUntil || 0, Date.now() + TESLA_STORM_STUN_DURATION);
        damageTexts.push({
            x: enemy.x,
            y: enemy.y - 14,
            text: actual,
            life: 42,
            color: '#d4fbff',
        });

        lightningEffects.push({
            points: createLightningPath(source.x, source.y, enemy.x, enemy.y, 18, 16),
            life: TESLA_LIGHTNING_LIFE + 2,
            maxLife: TESLA_LIGHTNING_LIFE + 2,
        });
    }

    const gatePairs = buildTeslaGatePairs(teslaTowers);
    for (const gatePair of gatePairs) {
        electricGates.push({
            from: gatePair[0],
            to: gatePair[1],
            expiresAt: Date.now() + TESLA_GATE_DURATION,
            enemyTickAt: new WeakMap(),
        });
    }
}

function castGoldRain() {
    if (gameState.gameOver) return;
    const bankCount = getBankTowerCount();
    if (bankCount < BANK_RAIN_MIN_TOWERS) return;
    if (getBankRainCooldownLeft() > 0) return;

    bankRainLastCast = Date.now();
    bankOverdriveUntil = Date.now() + (BANK_RAIN_OVERDRIVE_MS / gameSpeed);
    const instantGold = 80 + bankCount * 35 + gameState.wave * 10;
    gameState.gold += instantGold;
    damageTexts.push({
        x: canvas.width * 0.5,
        y: 90,
        text: `Gold Rain +$${instantGold}`,
        life: 60,
        color: '#b7ff9d',
    });
}

function castOrbitalBarrage() {
    if (gameState.gameOver) return;
    const launcherCount = getLauncherTowerCount();
    if (launcherCount < BARRAGE_MIN_TOWERS) return;
    if (getBarrageCooldownLeft() > 0) return;

    const aliveEnemies = gameState.enemies.filter(enemy => enemy.health > 0);
    if (aliveEnemies.length === 0) return;

    barrageLastCast = Date.now();
    const strikeCount = Math.min(6, aliveEnemies.length);
    const targets = [...aliveEnemies]
        .sort((a, b) => b.index - a.index)
        .slice(0, strikeCount);

    for (const target of targets) {
        pulseEffects.push({
            x: target.x,
            y: target.y,
            maxRadius: BARRAGE_RADIUS,
            life: 20,
            maxLife: 20,
            color: '#ff7a3d',
        });

        for (const enemy of gameState.enemies) {
            if (enemy.health <= 0) continue;
            const dist = Math.hypot(enemy.x - target.x, enemy.y - target.y);
            if (dist > BARRAGE_RADIUS) continue;
            const falloff = Math.max(0.5, 1 - (dist / BARRAGE_RADIUS) * 0.5);
            const actual = enemy.takeDamage(Math.round(BARRAGE_DAMAGE * falloff), 4);
            enemy.burnUntil = Math.max(enemy.burnUntil || 0, Date.now() + 1800);
            enemy.burnDps = Math.max(enemy.burnDps || 0, 30);
            damageTexts.push({
                x: enemy.x,
                y: enemy.y - 12,
                text: actual,
                life: 36,
                color: '#ffc07a',
            });
        }
    }
}

function updateAbilityButtons() {
    const teslaBtn = document.getElementById('teslaAbilityBtn');
    const bankBtn = document.getElementById('bankAbilityBtn');
    const barrageBtn = document.getElementById('barrageAbilityBtn');
    const abilityBar = teslaBtn.parentElement;
    const teslaCount = getTeslaTowerCount();
    const bankCount = getBankTowerCount();
    const launcherCount = getLauncherTowerCount();
    const cooldownLeft = getTeslaStormCooldownLeft();
    const bankCooldownLeft = getBankRainCooldownLeft();
    const barrageCooldownLeft = getBarrageCooldownLeft();
    const cooldownSeconds = Math.ceil(cooldownLeft / 1000);
    const bankCooldownSeconds = Math.ceil(bankCooldownLeft / 1000);
    const barrageCooldownSeconds = Math.ceil(barrageCooldownLeft / 1000);
    const teslaUnlocked = teslaCount >= TESLA_STORM_MIN_TOWERS;
    const bankUnlocked = bankCount >= BANK_RAIN_MIN_TOWERS;
    const barrageUnlocked = launcherCount >= BARRAGE_MIN_TOWERS;

    abilityBar.style.display = teslaUnlocked || bankUnlocked || barrageUnlocked ? 'flex' : 'none';

    teslaBtn.style.display = teslaUnlocked ? 'inline-block' : 'none';
    bankBtn.style.display = bankUnlocked ? 'inline-block' : 'none';
    barrageBtn.style.display = barrageUnlocked ? 'inline-block' : 'none';

    if (cooldownLeft > 0) {
        teslaBtn.disabled = true;
        teslaBtn.textContent = `Tesla Storm (${cooldownSeconds}s)`;
    } else {
        teslaBtn.disabled = !teslaUnlocked;
        teslaBtn.textContent = 'Tesla Storm: READY';
    }

    if (bankCooldownLeft > 0) {
        bankBtn.disabled = true;
        bankBtn.textContent = `Gold Rain (${bankCooldownSeconds}s)`;
    } else {
        bankBtn.disabled = !bankUnlocked;
        bankBtn.textContent = Date.now() < bankOverdriveUntil ? 'Gold Rain: ACTIVE' : 'Gold Rain: READY';
    }

    if (barrageCooldownLeft > 0) {
        barrageBtn.disabled = true;
        barrageBtn.textContent = `Orbital Barrage (${barrageCooldownSeconds}s)`;
    } else {
        barrageBtn.disabled = !barrageUnlocked;
        barrageBtn.textContent = 'Orbital Barrage: READY';
    }
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

function getTowerSpecialData(towerType) {
    return TOWER_SPECIALS[towerType] || { name: 'Special', max: 1, desc: '' };
}

function canApplySpecialUpgrade(tower) {
    const special = getTowerSpecialData(tower.type);
    return tower.specialLevel < special.max;
}

function canApplyFireUpgrade(tower) {
    return tower.fireRate > 120;
}

function applySpecialUpgrade(tower) {
    if (!canApplySpecialUpgrade(tower)) return false;

    if (tower.type === 1) {
        tower.projectilesPerShot += 1;
    } else if (tower.type === 2) {
        tower.armorPen += 4;
    } else if (tower.type === 3) {
        tower.extraPierce += 1;
        tower.fireRate = Math.max(120, Math.round(tower.fireRate * 0.9));
    } else if (tower.type === 4) {
        tower.projectilesPerShot += 2;
    } else if (tower.type === 5) {
        tower.slowDuration += 600;
        tower.slowFactor = roundTo(Math.max(0.08, tower.slowFactor * 0.82), 2);
    } else if (tower.type === 6) {
        tower.range = Math.round(tower.range + 18);
        tower.damage = Math.round(tower.damage * 1.12);
    } else if (tower.type === 7) {
        tower.projectilesPerShot += 1;
        tower.armorPen += 2;
    } else if (tower.type === 8) {
        tower.damage = Math.round(tower.damage * 1.2);
        tower.fireRate = Math.max(120, Math.round(tower.fireRate * 0.9));
    } else if (tower.type === 9) {
        tower.tempestRadius = Math.round(tower.tempestRadius + 5);
        tower.tempestMaxTargets += 1;
        tower.tempestPulseDamageScale = roundTo(tower.tempestPulseDamageScale * 1.08, 2);
        tower.tempestTickMs = Math.max(320, Math.round(tower.tempestTickMs * 0.93));
    } else if (tower.type === 10) {
        tower.bankIncome = Math.round(tower.bankIncome * 1.35);
        tower.fireRate = Math.max(700, Math.round(tower.fireRate * 0.88));
    } else if (tower.type === 11) {
        tower.range = Math.round(tower.range + 28);
    }

    tower.specialLevel++;
    return true;
}

function updateUpgradePanel() {
    const panel = document.getElementById('upgradePanel');
    const info  = document.getElementById('towerInfo');
    const specialBtn = document.getElementById('specialBtn');
    const fireBtn = document.getElementById('fireBtn');
    const damageBtn = document.getElementById('damageBtn');
    const rangeBtn = document.getElementById('rangeBtn');

    if (!gameState.selectedTower) {
        panel.style.display = 'none';
        return;
    }

    const t = gameState.selectedTower;
    const def = TOWER_DEFS[t.type];
    const special = getTowerSpecialData(t.type);
    const usesFire = t.type !== 11;
    const usesDamage = ![10, 11].includes(t.type);
    const usesRange = t.type !== 10;

    panel.style.display = 'flex';
    const infoLines = [];
    infoLines.push(`<b>${def.label} Tower</b>`);
    infoLines.push(`Level: ${t.level}`);
    if (usesDamage) infoLines.push(`Damage: ${Math.round(t.damage)}`);
    if (t.pierce + t.extraPierce > 0) infoLines.push(`Pierce: ${t.pierce + t.extraPierce}`);
    if (t.armorPen > 0) infoLines.push(`Armor pen: ${t.armorPen}`);
    if (t.projectilesPerShot > 1) infoLines.push(`Targets/shot: ${t.projectilesPerShot}`);
    if (t.type === 5) infoLines.push(`Slow: x${t.slowFactor.toFixed(2)} for ${(t.slowDuration / 1000).toFixed(1)}s`);
    if (t.type === 9) infoLines.push(`Storm: r${Math.round(t.tempestRadius)} / ${t.tempestMaxTargets} targets / ${(t.tempestTickMs / 1000).toFixed(2)}s pulse`);
    if (t.type === 10) infoLines.push(`Income: +$${Math.round(t.bankIncome)} every ${(t.fireRate / 1000).toFixed(2)}s`);
    if (t.type === 11) infoLines.push(`Reveal radius: ${Math.round(t.range)}`);
    if (usesRange) infoLines.push(`Range: ${Math.round(t.range)}`);
    if (usesFire) infoLines.push(`Fire rate: ${Math.round(t.fireRate)}ms`);
    infoLines.push(`Special: ${special.name} (${t.specialLevel}/${special.max})`);
    infoLines.push(`Upgrade cost: $${t.upgradeCost}`);

    info.innerHTML =
        infoLines.join('<br>');

    const canAfford = gameState.gold >= t.upgradeCost;
    const fireMaxed = usesFire && !canApplyFireUpgrade(t);
    fireBtn.style.display = usesFire ? 'block' : 'none';
    damageBtn.style.display = usesDamage ? 'block' : 'none';
    rangeBtn.style.display = usesRange ? 'block' : 'none';
    fireBtn.disabled   = !canAfford || !usesFire || fireMaxed;
    damageBtn.disabled = !canAfford || !usesDamage;
    rangeBtn.disabled  = !canAfford || !usesRange;
    specialBtn.disabled = !canAfford || !canApplySpecialUpgrade(t);
    fireBtn.title = fireMaxed ? 'Fire rate is already maxed.' : 'Improve tower fire rate.';
    specialBtn.textContent = `${special.name} (${t.specialLevel}/${special.max})`;
    specialBtn.title = special.desc;
}

function canvasPointToWorld(e) {
    const r = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    const contentWidth = r.width - borderLeft - borderRight;
    const contentHeight = r.height - borderTop - borderBottom;
    const scaleX = canvas.width / contentWidth;
    const scaleY = canvas.height / contentHeight;

    return {
        x: (e.clientX - r.left - borderLeft) * scaleX,
        y: (e.clientY - r.top - borderTop) * scaleY,
    };
}

// ================= UPGRADE KNOPPEN =================
function doUpgrade(type) {
    const t = gameState.selectedTower;
    if (!t || gameState.gold < t.upgradeCost) return;
    if (type === 'fire' && !canApplyFireUpgrade(t)) return;
    if (type === 'special' && !canApplySpecialUpgrade(t)) return;

    gameState.gold -= t.upgradeCost;
    t.level++;
    t.upgradeCost = Math.floor(t.upgradeCost * 1.5);

    if (type === 'special') {
        applySpecialUpgrade(t);
        return;
    }

    if (type === 'fire') {
        const fireMultiplier = t.type === 3 ? 0.82 : 0.92;
        t.fireRate = Math.max(120, Math.round(t.fireRate * fireMultiplier));
    }
    if (type === 'damage') {
        t.damage = Math.round(t.damage * 1.4);
        // Sniper damage upgrades also increase penetration.
        if (t.type === 3) t.pierce += 1;
    }
    if (type === 'range')  t.range = Math.round(t.range + 20);
}

document.getElementById('fireBtn').onclick   = () => doUpgrade('fire');
document.getElementById('damageBtn').onclick = () => doUpgrade('damage');
document.getElementById('rangeBtn').onclick  = () => doUpgrade('range');
document.getElementById('specialBtn').onclick  = () => doUpgrade('special');
document.getElementById('teslaAbilityBtn').onclick = () => castTeslaStorm();
document.getElementById('bankAbilityBtn').onclick = () => castGoldRain();
document.getElementById('barrageAbilityBtn').onclick = () => castOrbitalBarrage();

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
    if (gameState.paused) {
        requestAnimationFrame(loop);
        return;
    }

    const delta = (time - lastTime) / 16.67 * gameSpeed;
    lastTime = time;

    // Cap delta to prevent projectiles skipping enemies at high speeds
    const cappedDelta = Math.min(delta, 2);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawPath();
    drawSchoolInGame();

    if (!gameStarted) {
        requestAnimationFrame(loop);
        return;
    }

    if (!gameState.gameOver) {
        updateStealthReveals(Date.now());

        gameState.towers.forEach(t => { t.update(); t.draw(); });

        gameState.enemies = gameState.enemies.filter(e => {
            if (!e.update(cappedDelta)) return false;
            // Give reward on kill before removing from array
            if (e.health <= 0 && !e.rewardGiven) {
                gameState.gold  += e.reward;
                gameState.score += e.reward * 10;
                e.rewardGiven    = true;
            }
            if (e.health <= 0) return false;
            e.draw();
            return true;
        });

        gameState.projectiles = gameState.projectiles.filter(p => {
            const ok = p.update(cappedDelta);
            p.draw();
            return ok;
        });


        tempestZones = tempestZones.filter(zone => zone.expiresAt > Date.now() && zone.pulsesLeft > 0);
        for (const zone of tempestZones) {
            const now = Date.now();
            const armed = now >= zone.armedAt;
            const zoneLife = Math.max(0, zone.expiresAt - now);
            const alpha = Math.max(0.2, zoneLife / (zone.owner.tempestDurationMs + TEMPEST_ZONE_ARM_MS));

            const spin = now / 260;
            ctx.save();
            ctx.translate(zone.x, zone.y);
            if (!armed) {
                ctx.globalAlpha = 0.32;
                ctx.strokeStyle = '#9fd8ff';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(0, 0, zone.radius * 0.65, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.globalAlpha = 0.2 * alpha;
                ctx.fillStyle = '#70b8f0';
                ctx.beginPath();
                ctx.arc(0, 0, zone.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = 0.9 * alpha;
                ctx.strokeStyle = '#d9efff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = spin + (Math.PI * 2 * i) / 6;
                    const r = zone.radius * 0.72;
                    const x = Math.cos(a) * r;
                    const y = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            }
            ctx.restore();

            if (!armed || now < zone.nextTickAt) continue;
            zone.nextTickAt = now + zone.owner.tempestTickMs;
            zone.pulsesLeft--;

            const enemiesInZone = gameState.enemies
                .filter(enemy => enemy.health > 0 && Math.hypot(enemy.x - zone.x, enemy.y - zone.y) <= zone.radius)
                .sort((a, b) => Math.hypot(a.x - zone.x, a.y - zone.y) - Math.hypot(b.x - zone.x, b.y - zone.y))
                .slice(0, zone.owner.tempestMaxTargets);

            for (const enemy of enemiesInZone) {
                const pulseDamage = Math.max(1, Math.round(zone.owner.damage * zone.owner.tempestPulseDamageScale));
                const actual = enemy.takeDamage(pulseDamage, zone.owner.armorPen);
                enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + 420);
                enemy.slowFactor = Math.min(enemy.slowFactor || 1, zone.owner.tempestSlowFactor);
                damageTexts.push({
                    x: enemy.x,
                    y: enemy.y - 12,
                    text: actual,
                    life: 22,
                    color: '#bfeaff',
                });
                lightningEffects.push({
                    points: createLightningPath(zone.x, zone.y, enemy.x, enemy.y, 10, 8),
                    life: 3,
                    maxLife: 3,
                });
            }
        }

        electricGates = electricGates.filter(gate =>
            gate.expiresAt > Date.now() &&
            gameState.towers.includes(gate.from) &&
            gameState.towers.includes(gate.to)
        );
        for (const gate of electricGates) {
            const lifeLeft = Math.max(0, gate.expiresAt - Date.now());
            const alpha = Math.max(0.25, lifeLeft / TESLA_GATE_DURATION);

            const gatePath = createLightningPath(gate.from.x, gate.from.y, gate.to.x, gate.to.y, 22, 10);
            ctx.save();
            ctx.globalAlpha = 0.35 * alpha;
            ctx.strokeStyle = '#71deff';
            ctx.lineWidth = 7;
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#9cf8ff';
            ctx.beginPath();
            ctx.moveTo(gatePath[0].x, gatePath[0].y);
            for (let i = 1; i < gatePath.length; i++) {
                ctx.lineTo(gatePath[i].x, gatePath[i].y);
            }
            ctx.stroke();

            ctx.globalAlpha = 0.95 * alpha;
            ctx.strokeStyle = '#e9ffff';
            ctx.lineWidth = 2.2;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(gatePath[0].x, gatePath[0].y);
            for (let i = 1; i < gatePath.length; i++) {
                ctx.lineTo(gatePath[i].x, gatePath[i].y);
            }
            ctx.stroke();
            ctx.restore();

            for (const enemy of gameState.enemies) {
                if (enemy.health <= 0) continue;
                const dist = distancePointToSegment(enemy.x, enemy.y, gate.from.x, gate.from.y, gate.to.x, gate.to.y);
                if (dist > TESLA_GATE_HALF_WIDTH) continue;

                const nextTick = gate.enemyTickAt.get(enemy) || 0;
                if (Date.now() < nextTick) continue;

                const dmg = Math.max(1, Math.round(TESLA_GATE_DPS * (TESLA_GATE_TICK_MS / 1000)));
                const actual = enemy.takeDamage(dmg, 4);
                gate.enemyTickAt.set(enemy, Date.now() + TESLA_GATE_TICK_MS);
                enemy.stunUntil = Math.max(enemy.stunUntil || 0, Date.now() + 220);
                damageTexts.push({
                    x: enemy.x,
                    y: enemy.y - 12,
                    text: actual,
                    life: 20,
                    color: '#a5f5ff',
                });
            }
        }

        // pulse attack visual voor AOE torens
        pulseEffects = pulseEffects.filter(p => p.life > 0);
        for (let p of pulseEffects) {
            const progress = 1 - (p.life / p.maxLife);
            const alpha = p.life / p.maxLife;
            const eased = 1 - Math.pow(1 - progress, 2.2);
            const mainR = Math.max(8, p.maxRadius * eased);

            ctx.save();

            // ── bright central flash burst (first 30% of animation) ──
            if (progress < 0.3) {
                const flashT = 1 - (progress / 0.3);
                ctx.globalAlpha = flashT * 0.9;
                const flashR = p.maxRadius * 0.5 * (progress / 0.3);
                const flashGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, flashR));
                flashGrad.addColorStop(0,   'rgba(255,255,255,1)');
                flashGrad.addColorStop(0.25, p.color);
                flashGrad.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = flashGrad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1, flashR), 0, Math.PI * 2);
                ctx.fill();
            }

            // ── outer glow pass (wide, blurred) ──
            ctx.globalAlpha = alpha * 0.55;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 18;
            ctx.shadowBlur = 28;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, mainR, 0, Math.PI * 2);
            ctx.stroke();

            // ── mid ring pass ──
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 7;
            ctx.shadowBlur = 18;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, mainR, 0, Math.PI * 2);
            ctx.stroke();

            // ── white-hot leading edge ──
            ctx.globalAlpha = alpha * 0.95;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, mainR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // ── trailing ring ──
            const trailR = Math.max(4, p.maxRadius * eased * 0.72);
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, trailR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.restore();
            p.life--;
        }

        // Tesla chain lightning visual
        lightningEffects = lightningEffects.filter(effect => effect.life > 0);
        for (let effect of lightningEffects) {
            const alpha = effect.life / effect.maxLife;

            ctx.save();
            ctx.globalAlpha = 0.35 * alpha;
            ctx.strokeStyle = '#6edfff';
            ctx.lineWidth = 6;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#9cf8ff';
            ctx.beginPath();
            ctx.moveTo(effect.points[0].x, effect.points[0].y);
            for (let i = 1; i < effect.points.length; i++) {
                ctx.lineTo(effect.points[i].x, effect.points[i].y);
            }
            ctx.stroke();

            ctx.globalAlpha = 0.9 * alpha;
            ctx.strokeStyle = '#e7ffff';
            ctx.lineWidth = 2.2;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(effect.points[0].x, effect.points[0].y);
            for (let i = 1; i < effect.points.length; i++) {
                ctx.lineTo(effect.points[i].x, effect.points[i].y);
            }
            ctx.stroke();
            ctx.restore();

            effect.life--;
        }

        // damage tekst animatie
        damageTexts = damageTexts.filter(d => d.life > 0);
        for (let d of damageTexts) {
            ctx.fillStyle = d.color || 'yellow';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 4;
            ctx.fillText(d.text, d.x, d.y);
            ctx.shadowBlur = 0;
            d.y   -= 0.6;
            d.life--;
        }

        // UI updaten
        updateTowerButtons();
        updateUpgradePanel();
        updateAbilityButtons();

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

// ================= PATH COLLISION =================
function isOnPath(x, y, margin = 22) {
    for (let i = 0; i < path.length - 1; i++) {
        const ax = path[i].x * TILE_SIZE + 20;
        const ay = path[i].y * TILE_SIZE + 20;
        const bx = path[i + 1].x * TILE_SIZE + 20;
        const by = path[i + 1].y * TILE_SIZE + 20;
        if (distancePointToSegment(x, y, ax, ay, bx, by) < margin) return true;
    }
    return false;
}

// ================= CANVAS KLIK =================
canvas.onclick = (e) => {
    if (!gameStarted) return;
    if (suppressNextCanvasClick) {
        suppressNextCanvasClick = false;
        return;
    }

    const point = canvasPointToWorld(e);
    const x = point.x;
    const y = point.y;

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
            if (isOnPath(x, y)) return; // can't place on path
            const tooClose = gameState.towers.some(t => Math.hypot(t.x - x, t.y - y) < 20);
            if (tooClose) return; // can't overlap existing tower
            gameState.towers.push(new Tower(x, y, gameState.selectedTowerType));
            gameState.gold -= def.cost;
            gameState.selectedTowerType = null;
        }
    }
};

// ================= TOREN SELECTIE KNOPPEN =================
for (let i = 1; i <= 11; i++) {
    document.getElementById(`tower${i}`).onclick = () => {
        gameState.selectedTowerType = i;
    };
}

document.getElementById('startWave').onclick = () => {
    if (!gameStarted) return;
    spawnWave();
};
document.getElementById('autoStartToggle').onclick = () => {
    if (!gameStarted) return;
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

document.getElementById('pauseBtn').onclick = () => {
    if (!gameStarted || gameState.gameOver) return;
    gameState.paused = !gameState.paused;
    document.getElementById('pauseBtn').textContent = gameState.paused ? 'Resume' : 'Pause';
    if (!gameState.paused) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
    }
};
document.getElementById('gamespeedToggle').onclick = () => {
    if (gameSpeed === 1) {
        gameSpeed = 1.5;
    } else if (gameSpeed === 1.5) {
        gameSpeed = 2;
    } else if (gameSpeed === 2) {
        gameSpeed = 3;
    } else if (gameSpeed === 3) {
        gameSpeed = 5;
    } else {
        gameSpeed = 1;
    }
    updateSpeedButton();
};

function updateSpeedButton() {
    const btn = document.getElementById('gamespeedToggle');
    btn.textContent = `Speed x${gameSpeed}`;
}

document.getElementById('playBtn').onclick = () => {
    gameStarted = true;
    document.getElementById('startScreen').style.display = 'none';
};

document.getElementById('guideBtn').onclick = () => {
    document.getElementById('startMenu').style.display = 'none';
    document.getElementById('guideScreen').style.display = 'block';
};

document.getElementById('backBtn').onclick = () => {
    document.getElementById('guideScreen').style.display = 'none';
    document.getElementById('startMenu').style.display = 'block';
};


// START
setWaveButton(true);
updateAutoStartButton();
updateSpeedButton();
loop();