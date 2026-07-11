// ============================================================
// Screen Effects — damage numbers, shake, flash, announcements
// ============================================================

export function createDamageNumber(x, y, damage, isCrit = false) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:${isCrit ? '#ff4444' : '#e8ff47'};font-family:monospace;font-size:${isCrit ? '24px' : '18px'};font-weight:bold;text-shadow:2px 2px 4px #000;z-index:250;pointer-events:none;transition:transform 0.8s,opacity 0.8s;`;
  el.textContent = isCrit ? `CRIT ${damage}!` : `-${damage}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 800);
}

export function createHealNumber(x, y, amount) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:#44ff44;font-family:monospace;font-size:18px;font-weight:bold;text-shadow:2px 2px 4px #000;z-index:250;pointer-events:none;transition:transform 0.8s,opacity 0.8s;`;
  el.textContent = `+${amount}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 800);
}

export function screenShake(intensity = 5, duration = 200) {
  const container = document.getElementById('game-container');
  if (!container) return;
  const start = Date.now();
  const shake = () => {
    const elapsed = Date.now() - start;
    if (elapsed > duration) { container.style.transform = ''; return; }
    const x = (Math.random() - 0.5) * intensity * 2;
    const y = (Math.random() - 0.5) * intensity * 2;
    container.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(shake);
  };
  shake();
}

export function flashRed() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,0,0,0.3);z-index:400;pointer-events:none;opacity:1;transition:opacity 0.3s;';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '0'; });
  setTimeout(() => overlay.remove(), 300);
}

export function goldenFlash() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(232,255,71,0.3);z-index:400;pointer-events:none;opacity:1;transition:opacity 0.5s;';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '0'; });
  setTimeout(() => overlay.remove(), 500);
}

export function showWaveAnnouncement(wave, total) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);color:#e8ff47;font-family:monospace;font-size:32px;font-weight:bold;text-shadow:0 0 20px #e8ff47;z-index:300;pointer-events:none;opacity:0;transition:opacity 0.5s;';
  el.textContent = `WAVE ${wave}/${total}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; }, 1500);
  setTimeout(() => el.remove(), 2000);
}

export function showVictory(stats) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,6,18,0.9);z-index:500;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#e8ff47;font-family:monospace;';
  el.innerHTML = `<div style="font-size:48px;font-weight:bold;margin-bottom:20px;">RIFT CLEARED</div>
    <div style="font-size:16px;color:#aaa;">Enemies Defeated: ${stats.kills || 0}</div>
    <div style="font-size:16px;color:#aaa;">XP Earned: ${stats.xp || 0}</div>
    <div style="font-size:16px;color:#aaa;">SEED Rank: ${stats.rank || 'D'}</div>
    <div style="margin-top:30px;font-size:14px;color:#666;animation:blink 1s infinite;">Press ENTER to continue</div>`;
  document.body.appendChild(el);
  const handler = (e) => { if (e.key === 'Enter') { el.remove(); window.removeEventListener('keydown', handler); } };
  window.addEventListener('keydown', handler);
}

export function showDefeat(stats) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,6,18,0.92);z-index:500;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#ff4444;font-family:monospace;';
  el.innerHTML = `<div style="font-size:48px;font-weight:bold;margin-bottom:20px;">DEFEATED</div>
    <div style="font-size:16px;color:#aaa;">Waves Cleared: ${stats.waves || 0}</div>
    <div style="font-size:16px;color:#aaa;">Enemies Defeated: ${stats.kills || 0}</div>
    <div style="margin-top:30px;padding:10px 30px;border:2px solid #e8ff47;color:#e8ff47;cursor:pointer;font-size:16px;" onclick="this.parentElement.remove();location.reload();">RESPAWN</div>`;
  document.body.appendChild(el);
}
