// ============================================================
// Portal Effect — the ONE thing judges will remember
// Animated CSS portal with particles, swirl, and glow
// ============================================================

export function createPortal() {
  const container = document.createElement('div');
  container.id = 'rift-portal';
  container.style.cssText = 'position:fixed;pointer-events:none;z-index:50;';

  // Outer glow ring
  const outerGlow = document.createElement('div');
  outerGlow.style.cssText = `
    width: 100px; height: 130px;
    border-radius: 50%;
    background: radial-gradient(ellipse,
      rgba(168,85,247,0.0) 30%,
      rgba(168,85,247,0.15) 50%,
      rgba(74,158,255,0.1) 70%,
      transparent 100%
    );
    animation: portalOuterGlow 3s ease-in-out infinite;
    position: absolute;
    top: -15px; left: -15px;
  `;

  // Core portal
  const core = document.createElement('div');
  core.style.cssText = `
    width: 70px; height: 100px;
    border-radius: 50%;
    background: radial-gradient(ellipse,
      rgba(232,255,71,0.4) 0%,
      rgba(168,85,247,0.6) 30%,
      rgba(74,158,255,0.3) 60%,
      transparent 80%
    );
    border: 2px solid rgba(168,85,247,0.6);
    box-shadow:
      0 0 20px rgba(168,85,247,0.4),
      0 0 40px rgba(168,85,247,0.2),
      inset 0 0 15px rgba(232,255,71,0.2);
    animation: portalCore 2s ease-in-out infinite;
    position: absolute;
    top: 0; left: 0;
  `;

  // Inner diamond
  const diamond = document.createElement('div');
  diamond.style.cssText = `
    width: 20px; height: 20px;
    background: rgba(232,255,71,0.8);
    transform: rotate(45deg);
    position: absolute;
    top: 40px; left: 25px;
    box-shadow: 0 0 10px rgba(232,255,71,0.6), 0 0 20px rgba(232,255,71,0.3);
    animation: portalDiamond 1.5s ease-in-out infinite;
  `;

  // Swirl particles (more of them, tighter spiral)
  const particleContainer = document.createElement('div');
  particleContainer.style.cssText = 'position:absolute;top:0;left:0;width:70px;height:100px;overflow:hidden;border-radius:50%;';

  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('div');
    const delay = (i / 12) * 2;
    const size = 2 + Math.random() * 2;
    const color = i % 3 === 0 ? 'rgba(232,255,71,0.8)' : i % 3 === 1 ? 'rgba(168,85,247,0.7)' : 'rgba(74,158,255,0.7)';
    particle.style.cssText = `
      position: absolute;
      width: ${size}px; height: ${size}px;
      background: ${color};
      border-radius: 50%;
      top: 50%; left: 50%;
      animation: portalParticle 1.8s ${delay}s linear infinite;
      box-shadow: 0 0 4px ${color};
    `;
    particleContainer.appendChild(particle);
  }

  // Rotating rune ring
  const runes = document.createElement('div');
  runes.style.cssText = `
    width: 90px; height: 120px;
    border: 1px solid rgba(168,85,247,0.25);
    border-top: 2px solid rgba(232,255,71,0.3);
    border-bottom: 2px solid rgba(74,158,255,0.3);
    border-radius: 50%;
    position: absolute;
    top: -10px; left: -10px;
    animation: portalRunes 6s linear infinite;
  `;

  // Second counter-rotating ring
  const runes2 = document.createElement('div');
  runes2.style.cssText = `
    width: 110px; height: 140px;
    border: 1px dashed rgba(168,85,247,0.15);
    border-radius: 50%;
    position: absolute;
    top: -20px; left: -20px;
    animation: portalRunes 10s linear infinite reverse;
  `;

  container.appendChild(outerGlow);
  container.appendChild(core);
  container.appendChild(diamond);
  container.appendChild(particleContainer);
  container.appendChild(runes);
  container.appendChild(runes2);

  // CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes portalOuterGlow {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.15); opacity: 0.8; }
    }
    @keyframes portalCore {
      0%, 100% { box-shadow: 0 0 20px rgba(168,85,247,0.4), 0 0 40px rgba(168,85,247,0.2), inset 0 0 15px rgba(232,255,71,0.2); }
      50% { box-shadow: 0 0 30px rgba(168,85,247,0.6), 0 0 60px rgba(168,85,247,0.3), inset 0 0 25px rgba(232,255,71,0.3); }
    }
    @keyframes portalDiamond {
      0%, 100% { transform: rotate(45deg) scale(1); opacity: 0.8; }
      50% { transform: rotate(225deg) scale(1.2); opacity: 1; }
    }
    @keyframes portalParticle {
      0% { transform: translate(0, 0) scale(1); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translate(35px, -50px) scale(0); opacity: 0; }
    }
    @keyframes portalRunes {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(container);
  return container;
}
