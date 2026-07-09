// ============================================================
// Skill VFX — visual effects for skill usage
// ============================================================

const SKILL_EFFECTS = {
  // Damage skills — red/orange flash on target
  shadowStrike: { color: '#ff4444', icon: '⚔', duration: 400, flash: true },
  fireball:     { color: '#ff6600', icon: '🔥', duration: 500, flash: true },
  iceShard:     { color: '#44aaff', icon: '❄', duration: 400, flash: true, slow: true },
  poisonDagger: { color: '#44ff44', icon: '🗡', duration: 300, flash: true, dot: true },
  arrowShot:    { color: '#ffcc00', icon: '🏹', duration: 300, flash: true },
  riftSlash:    { color: '#e8ff47', icon: '🌀', duration: 500, flash: true, aoe: true },
  shieldBash:   { color: '#ffff00', icon: '🛡', duration: 400, flash: true, stun: true },
  // Self skills — green/blue glow on player
  heal:         { color: '#44ff44', icon: '💚', duration: 600, self: true },
  warCry:       { color: '#ff8800', icon: '📢', duration: 500, self: true, buff: true },
  // Movement skills — trail effect
  riftTeleport: { color: '#4a9eff', icon: '◆', duration: 300, move: true },
  dash:         { color: '#aaffaa', icon: '💨', duration: 300, move: true },
};

export function showSkillEffect(skillId, x, y) {
  const effect = SKILL_EFFECTS[skillId];
  if (!effect) return;

  const el = document.createElement('div');

  if (effect.self) {
    // Self skill: expanding ring around player
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:250;display:flex;align-items:center;justify-content:center;`;
    el.innerHTML = `
      <div style="width:80px;height:80px;border-radius:50%;border:3px solid ${effect.color};opacity:1;transform:scale(0.3);animation:selfBurst ${effect.duration}ms ease-out forwards;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:20px;filter:drop-shadow(0 0 8px ${effect.color});">${effect.icon}</span>
      </div>
    `;
  } else if (effect.flash) {
    // Damage skill: flash on target with icon
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:250;display:flex;align-items:center;justify-content:center;`;
    el.innerHTML = `
      <div style="width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,${effect.color} 0%,transparent 70%);opacity:1;transform:scale(0.5);animation:skillFlash ${effect.duration}ms ease-out forwards;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:22px;filter:drop-shadow(0 0 10px ${effect.color});">${effect.icon}</span>
      </div>
    `;

    // Additional effect indicator
    if (effect.slow) {
      const slowTag = document.createElement('div');
      slowTag.style.cssText = `position:fixed;left:${x+30}px;top:${y-20}px;color:#44aaff;font-family:monospace;font-size:10px;font-weight:bold;z-index:251;pointer-events:none;transition:opacity 1s;`;
      slowTag.textContent = 'SLOWED';
      document.body.appendChild(slowTag);
      setTimeout(() => { slowTag.style.opacity = '0'; }, 2000);
      setTimeout(() => slowTag.remove(), 3000);
    }
    if (effect.stun) {
      const stunTag = document.createElement('div');
      stunTag.style.cssText = `position:fixed;left:${x+30}px;top:${y-20}px;color:#ffff00;font-family:monospace;font-size:10px;font-weight:bold;z-index:251;pointer-events:none;transition:opacity 1s;`;
      stunTag.textContent = 'STUNNED';
      document.body.appendChild(stunTag);
      setTimeout(() => { stunTag.style.opacity = '0'; }, 1500);
      setTimeout(() => stunTag.remove(), 2000);
    }
    if (effect.dot) {
      const dotTag = document.createElement('div');
      dotTag.style.cssText = `position:fixed;left:${x+30}px;top:${y-20}px;color:#44ff44;font-family:monospace;font-size:10px;font-weight:bold;z-index:251;pointer-events:none;transition:opacity 1s;`;
      dotTag.textContent = 'POISONED';
      document.body.appendChild(dotTag);
      setTimeout(() => { dotTag.style.opacity = '0'; }, 2500);
      setTimeout(() => dotTag.remove(), 3000);
    }
    if (effect.aoe) {
      const aoeTag = document.createElement('div');
      aoeTag.style.cssText = `position:fixed;left:${x-20}px;top:${y+10}px;color:#e8ff47;font-family:monospace;font-size:10px;font-weight:bold;z-index:251;pointer-events:none;transition:opacity 1s;`;
      aoeTag.textContent = 'AOE';
      document.body.appendChild(aoeTag);
      setTimeout(() => { aoeTag.style.opacity = '0'; }, 1000);
      setTimeout(() => aoeTag.remove(), 1500);
    }
  } else if (effect.move) {
    // Movement skill: trail dots
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:250;`;
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `width:6px;height:6px;background:${effect.color};border-radius:50%;position:absolute;left:${i*8}px;top:${i*4}px;opacity:${1 - i*0.2};animation:trailFade ${effect.duration}ms ease-out forwards;animation-delay:${i*50}ms;`;
      el.appendChild(dot);
    }
  }

  document.body.appendChild(el);
  setTimeout(() => el.remove(), effect.duration + 100);
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

// Add CSS animations
const style = document.createElement('style');
style.textContent = `@keyframes skillBurst{0%{transform:scale(0.3);opacity:1}50%{transform:scale(1.2);opacity:0.8}100%{transform:scale(1.5);opacity:0}}@keyframes selfBurst{0%{transform:scale(0.3);opacity:1}100%{transform:scale(1.5);opacity:0}}@keyframes skillFlash{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.3);opacity:0}}@keyframes trailFade{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-10px)}}`;
document.head.appendChild(style);
