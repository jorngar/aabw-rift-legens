// ============================================================
// Class Selection Screen — choose before game starts
// ============================================================
import { CLASS_STATS, PLAYER_CLASSES, PLAYER_DEFAULTS, SKILLS } from '@rift-seed/shared/config';

const CLASSES = Object.values(PLAYER_CLASSES).map(cls => {
  const stats = CLASS_STATS[cls.id];
  return {
    ...cls,
    desc: cls.description,
    stats: [
      `HP: ${Math.round(PLAYER_DEFAULTS.maxHp * stats.hpMult)}`,
      `MP: ${Math.round(PLAYER_DEFAULTS.maxMp * stats.mpMult)}`,
      `DMG: ${Math.round(PLAYER_DEFAULTS.attackDamage * stats.damageMult)}`,
      `SPD: ${(PLAYER_DEFAULTS.speed * stats.speedMult).toFixed(1)}`,
    ].join(' | '),
  };
});

/**
 * Show class selection screen.
 * @param {Function} onClassSelected - callback(classId)
 */
export function showClassSelection(onClassSelected) {
  const el = document.createElement('div');
  el.id = 'class-select';
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0612;z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:monospace;overflow-y:auto;';

  let html = `
    <div style="text-align:center;margin-bottom:30px;">
      <div style="font-size:36px;font-weight:bold;color:#e8ff47;letter-spacing:4px;">CHOOSE YOUR CLASS</div>
      <div style="font-size:12px;color:#888;margin-top:8px;">SEED Academy Cadet Selection</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:900px;padding:0 20px;">
  `;

  for (const cls of CLASSES) {
    const skillIcons = cls.skills.map(s => {
      const skill = SKILLS[s];
      return skill ? `<span style="font-size:16px;margin:0 2px;" title="${skill.name}: ${skill.desc}">${skill.icon || '?'}</span>` : '';
    }).join('');

    html += `
      <div class="class-card" data-class="${cls.id}" style="background:#1a1a2a;border:2px solid ${cls.color};border-radius:12px;padding:20px;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;text-align:center;">
        <div style="font-size:20px;font-weight:bold;color:${cls.color};margin-bottom:8px;">${cls.name}</div>
        <div style="font-size:10px;color:#aaa;margin-bottom:12px;">${cls.desc}</div>
        <div style="font-size:10px;color:#888;margin-bottom:8px;">${cls.stats}</div>
        <div style="font-size:10px;color:#e8ff47;margin-bottom:12px;font-style:italic;">${cls.passive}</div>
        <div style="font-size:10px;color:#888;margin-bottom:4px;">SKILLS</div>
        <div style="margin-bottom:8px;">${skillIcons}</div>
        <div style="font-size:9px;color:#555;">
          ${cls.skills.map(s => SKILLS[s]?.name || s).join(' • ')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  el.innerHTML = html;

  // Add hover styles
  const style = document.createElement('style');
  style.textContent = `
    .class-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(232,255,71,0.15); }
    .class-card:active { transform: translateY(0); }
  `;
  document.head.appendChild(style);

  // Click handlers
  el.querySelectorAll('.class-card').forEach(card => {
    card.addEventListener('click', () => {
      const classId = card.dataset.class;
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onClassSelected(classId); }, 500);
    });
  });

  document.body.appendChild(el);
}

/**
 * Get class config by ID.
 */
export function getClassConfig(classId) {
  return CLASSES.find(c => c.id === classId) || CLASSES[0];
}
