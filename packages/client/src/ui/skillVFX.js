// ============================================================
// Skill VFX — visual effects for skill usage
// ============================================================

const SKILL_EFFECTS = {
  shadowStrike: {
    color: '#a855f7',
    icon: '⚡',
    sound: 'SLASH',
    duration: 400,
  },
  riftSlash: {
    color: '#e8ff47',
    icon: '🌀',
    sound: 'SWIPE',
    duration: 500,
  },
  heal: {
    color: '#44ff44',
    icon: '✦',
    sound: 'HEAL',
    duration: 600,
  },
  riftTeleport: {
    color: '#4a9eff',
    icon: '◆',
    sound: 'WARP',
    duration: 300,
  },
};

export function showSkillEffect(skillId, x, y) {
  const effect = SKILL_EFFECTS[skillId];
  if (!effect) return;

  // Create burst effect
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:250;display:flex;align-items:center;justify-content:center;`;

  // Inner glow circle
  el.innerHTML = `
    <div style="width:60px;height:60px;border-radius:50%;border:3px solid ${effect.color};opacity:1;transform:scale(0.5);animation:skillBurst ${effect.duration}ms ease-out forwards;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:24px;filter:drop-shadow(0 0 8px ${effect.color});">${effect.icon}</span>
    </div>
  `;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), effect.duration);
}

export function showDamageHit(x, y, damage, isCrit = false) {
  const el = document.createElement('div');
  const color = isCrit ? '#ff4444' : '#e8ff47';
  const size = isCrit ? '28px' : '20px';
  const glow = isCrit ? '0 0 15px rgba(255,68,68,0.8)' : '0 0 8px rgba(232,255,71,0.5)';
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:260;font-family:monospace;font-size:${size};font-weight:bold;color:${color};text-shadow:2px 2px 4px #000, ${glow};transform:translateY(0) scale(1.5);opacity:1;transition:transform 0.8s ease-out,opacity 0.8s;`;
  el.textContent = isCrit ? `CRIT ${damage}!` : `-${damage}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-60px) scale(1)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 800);
}

export function showHealEffect(x, y, amount) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:260;font-family:monospace;font-size:16px;font-weight:bold;color:#44ff44;text-shadow:2px 2px 4px #000, 0 0 10px #44ff44;transform:translateY(0);opacity:1;transition:transform 0.8s ease-out,opacity 0.8s;`;
  el.textContent = `+${amount}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-50px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 800);
}

export function showGoldDrop(x, y, amount) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:260;font-family:monospace;font-size:14px;font-weight:bold;color:#f59e0b;text-shadow:1px 1px 3px #000;transform:translateY(0);opacity:1;transition:transform 1s ease-out,opacity 1s;`;
  el.textContent = `+${amount}g`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-40px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `@keyframes skillBurst{0%{transform:scale(0.3);opacity:1}50%{transform:scale(1.2);opacity:0.8}100%{transform:scale(1.5);opacity:0}}`;
document.head.appendChild(style);
