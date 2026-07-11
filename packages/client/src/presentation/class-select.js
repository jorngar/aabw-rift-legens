// ============================================================
// Class Selection Screen — choose before game starts
// ============================================================
import { SKILLS } from '@rift-seed/shared/config';

const CLASSES = [
  // Stats reflect CLASS_STATS multipliers applied to PLAYER_DEFAULTS
  {
    id: 'warrior', name: 'WARRIOR', color: '#ff6b35',
    desc: 'Melee fighter with high HP and defense',
    stats: 'HP: 650 | MP: 60 | DMG: 35 | SPD: 2.8',
    passive: 'Thick Skin: -10% damage taken',
    skills: ['shadowStrike', 'riftSlash', 'shieldBash', 'warCry'],
  },
  {
    id: 'mage', name: 'MAGE', color: '#4a9eff',
    desc: 'Ranged caster with high MP and skill damage',
    stats: 'HP: 350 | MP: 150 | DMG: 21 | SPD: 2.6',
    passive: 'Arcane Overflow: +20% skill damage',
    skills: ['fireball', 'iceShard', 'heal', 'riftTeleport'],
  },
  {
    id: 'rogue', name: 'ROGUE', color: '#44ff44',
    desc: 'Fast attacker with critical hits',
    stats: 'HP: 400 | MP: 80 | DMG: 29 | SPD: 4.0',
    passive: 'Backstab: 25% crit chance',
    skills: ['poisonDagger', 'shadowStrike', 'dash', 'heal'],
  },
  {
    id: 'ranger', name: 'RANGER', color: '#f59e0b',
    desc: 'Ranged attacker with superior reach',
    stats: 'HP: 375 | MP: 100 | DMG: 26 | SPD: 3.2',
    passive: 'Eagle Eye: +20% attack range',
    skills: ['arrowShot', 'riftSlash', 'summonWolf', 'heal'],
  },
];

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
