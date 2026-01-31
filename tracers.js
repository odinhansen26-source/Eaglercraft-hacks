// Tracers Mod for Eaglercraft 1.12.2 (EaglerForge JS) - 10k SCAN UPDATE
// Toggle: "Å" (normal ~256 blocks, low lag)
// Far Scan Toggle: SHIFT + "Å" (10k blocks - EXTREME LAG WARNING: 10-60s freeze per scan, browser crash risk!)
// Tracers: Red=players (full render dist), Green=chests, Cyan=shulkers, Magenta=e-chests
// Auto-rescan: Frequent for normal, rare for far
// Inject via EaglerForge, host on GitHub Pages

(function() {
    'use strict';
    let enabled = false;
    let useFarScan = false;
    let canvas, ctx;
    let chests = [], lastScanX = 0, lastScanTime = 0;
    const NORMAL_RANGE = 256;
    const FAR_RANGE = 10000;
    const PI = Math.PI;

    // Require APIs
    ModAPI.require('player');
    ModAPI.require('settings');

    // Create overlay canvas
    function initCanvas() {
        canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '9999';
        canvas.style.pointerEvents = 'none';
        canvas.style.background = 'transparent';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        updateCanvasSize();
    }

    function updateCanvasSize() {
        if (!canvas) return;
        canvas.width = ModAPI.getdisplayWidth();
        canvas.height = ModAPI.getdisplayHeight();
    }

    // World to screen projection (Minecraft 1.12 accurate)
    function worldToScreen(wx, wy, wz, px, py, pz, yaw, pitch, fov, w, h) {
        let dx = wx - px;
        let dy = wy - py - 1.62; // Eye height offset
        let dz = wz - pz;

        // Rotate yaw
        let yawRad = -yaw * PI / 180;
        let cr = Math.cos(yawRad);
        let sr = Math.sin(yawRad);
        let dx1 = dx * cr + dz * sr;
        let dz1 = -dx * sr + dz * cr;
        let dy1 = dy;

        // Rotate pitch
        let pitchRad = -pitch * PI / 180;
        let cp = Math.cos(pitchRad);
        let sp = Math.sin(pitchRad);
        let dx2 = dx1;
        let dy2 = dy1 * cp - dz1 * sp;
        let dz2 = dy1 * sp + dz1 * cp;

        if (dz2 < 0.02) return null;

        let factor = (h / 2) / Math.tan((fov / 2) * PI / 180);
        let sx = (w / 2) + (dx2 * factor / dz2);
        let sy = (h / 2) - (dy2 * factor / dz2);

        return {x: sx, y: sy};
    }

    // Scan storage (optimized sphere loop)
    function scanStorage() {
        let startTime = Date.now();
        chests = [];
        let world = ModAPI.mcinstance.theWorld;
        if (!world) return;
        let cx = Math.floor(ModAPI.player.posX);
        let cy = Math.floor(ModAPI.player.posY);
        let cz = Math.floor(ModAPI.player.posZ);
        let range = useFarScan ? FAR_RANGE : NORMAL_RANGE;
        let vertRange = useFarScan ? 64 : 32; // Limit vertical for far scan (realistic bases)

        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -vertRange; dy <= vertRange; dy++) {
                for (let dz = -range; dz <= range; dz++) {
                    let distSq = dx*dx + dy*dy + dz*dz;
                    if (distSq > range * range) continue;
                    let bx = cx + dx, by = cy + dy, bz = cz + dz;
                    try {
                        let state = world.getBlockState(bx, by, bz);
                        if (state) {
                            let block = state.getBlock();
                            let name = block.getUnlocalizedName();
                            if (name.includes('chest') || name === 'tile.enderChest' || name.includes('shulkerBox')) {
                                chests.push({x: bx + 0.5, y: by + 0.9, z: bz + 0.5, type: name});
                            }
                        }
                    } catch (e) {} // Unloaded chunks/air
                    if (Date.now() - startTime > 50) { // Throttle: max 50ms per partial scan
                        ModAPI.displayToChat({msg: `§e[Tracers] §cPartial far scan... (lag protection)`});
                        return;
                    }
                }
            }
        }
        let scanTime = (Date.now() - startTime) / 1000;
        ModAPI.displayToChat({msg: `§aScanned ${chests.length} storage in ${scanTime.toFixed(1)}s (range: ${range})`});
    }

    // Draw tracers
    function draw() {
        requestAnimationFrame(draw);
        if (!enabled || !document.pointerLockElement || !ModAPI.player || !ModAPI.settings) {
            if (canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        let px = ModAPI.player.posX || ModAPI.player.lastReportedPosX;
        let py = ModAPI.player.posY || ModAPI.player.lastReportedPosY;
        let pz = ModAPI.player.posZ || ModAPI.player.lastReportedPosZ;
        let yaw = ModAPI.player.rotationYaw;
        let pitch = ModAPI.player.rotationPitch;
        let fov = ModAPI.settings.fovSetting || 70;
        let w = canvas.width;
        let h = canvas.height;
        let cx = w / 2;
        let cy = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.7;

        let world = ModAPI.mcinstance.theWorld;
        if (world) {
            // Players (full render dist, no scan needed)
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            try {
                let playerEntities = world.playerEntities || world.loadedEntityList || [];
                for (let i = 0; i < playerEntities.length; i++) {
                    let e = playerEntities[i];
                    if (e && e.username && e.username !== ModAPI.player.username && e.getDistanceSqToEntity) {
                        let distSq = e.getDistanceSqToEntity(ModAPI.player);
                        if (distSq < 1000000) { // Cap 1k blocks
                            let proj = worldToScreen(e.posX, e.posY + (e.height || 1.8)/2, e.posZ, px, py, pz, yaw, pitch, fov, w, h);
                            if (proj && proj.x > 0 && proj.x < w && proj.y > 0 && proj.y < h) {
                                ctx.beginPath();
                                ctx.moveTo(cx, cy);
                                ctx.lineTo(proj.x, proj.y);
                                ctx.stroke();
                            }
                        }
                    }
                }
            } catch (e) {}

            // Storage (cached scan)
            let rescanDist = useFarScan ? 1000 : 10;
            let rescanTime = useFarScan ? 600000 : 5000; // 10min for far
            if (Math.abs(px - lastScanX) > rescanDist || Date.now() - lastScanTime > rescanTime) {
                scanStorage();
                lastScanX = px;
                lastScanTime = Date.now();
            }
            chests.forEach(b => {
                let color = b.type.includes('chest') && !b.type.includes('trapped') ? '#44ff44' : 
                           (b.type.includes('enderChest') ? '#ff44ff' : '#44ffff');
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                let proj = worldToScreen(b.x, b.y, b.z, px, py, pz, yaw, pitch, fov, w, h);
                if (proj && proj.x > 0 && proj.x < w && proj.y > 0 && proj.y < h) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(proj.x, proj.y);
                    ctx.stroke();
                }
            });
        }
    }

    // Keybinds
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Å' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.shiftKey) {
                // Shift+Å: Toggle far scan
                useFarScan = !useFarScan;
                ModAPI.displayToChat({msg: `§e[Tracers] §${useFarScan ? 'aFAR SCAN ON (10k - LAG HEAVY!)' : 'cFar OFF'}`});
                if (useFarScan) scanStorage(); // Immediate far scan
            } else {
                // Å: Toggle tracers
                enabled = !enabled;
                ModAPI.displayToChat({msg: `§e[Tracers] §${enabled ? 'aON' : 'cOFF'} (Far: ${useFarScan ? 'ON' : 'OFF'})`});
                if (enabled && !useFarScan) scanStorage();
            }
        }
    });

    // Init
    initCanvas();
    window.addEventListener('resize', updateCanvasSize);
    draw();

    ModAPI.displayToChat({msg: '§e[Tracers 10k] §aLoaded! Å=Toggle, SHIFT+Å=Far Scan (10k LAG WARN)'});
})();
