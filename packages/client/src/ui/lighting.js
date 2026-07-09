// ============================================================
// Lighting System — player light source, ambient glow
// ============================================================

/**
 * Creates a player light source that follows the player position.
 * Uses a CSS radial gradient overlay for the vignette effect.
 */
export class LightingSystem {
  constructor() {
    this.overlay = null;
    this._init();
  }

  _init() {
    // Create dark overlay with cutout for player light
    this.overlay = document.createElement('div');
    this.overlay.id = 'lighting-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 45;
      background: radial-gradient(
        ellipse 400px 300px at 50% 50%,
        transparent 0%,
        transparent 30%,
        rgba(5, 3, 15, 0.3) 60%,
        rgba(5, 3, 15, 0.6) 80%,
        rgba(5, 3, 15, 0.85) 100%
      );
      transition: background 0.3s;
    `;
    document.body.appendChild(this.overlay);

    // Add ambient particles
    this._addParticles();
  }

  /**
   * Update the light position to follow the player.
   * @param {number} screenX - player screen X (center of viewport)
   * @param {number} screenY - player screen Y (center of viewport)
   */
  update(screenX, screenY) {
    // Player light source — bright center, dark edges
    this.overlay.style.background = `
      radial-gradient(
        ellipse 400px 300px at 50% 50%,
        rgba(200, 210, 180, 0.08) 0%,
        rgba(100, 110, 80, 0.03) 30%,
        transparent 50%,
        rgba(5, 3, 15, 0.15) 70%,
        rgba(5, 3, 15, 0.35) 90%,
        rgba(5, 3, 15, 0.5) 100%
      )
    `;
  }

  _addParticles() {
    // Floating dust particles for atmosphere
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      const size = 2 + Math.random() * 3;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const duration = 8 + Math.random() * 12;
      const delay = Math.random() * duration;

      particle.style.cssText = `
        position: fixed;
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        background: rgba(232, 255, 71, ${0.1 + Math.random() * 0.15});
        border-radius: 50%;
        pointer-events: none;
        z-index: 46;
        animation: dustFloat ${duration}s ease-in-out ${delay}s infinite;
      `;
      this.overlay.appendChild(particle);
    }

    // Add dust animation CSS
    if (!document.getElementById('dust-style')) {
      const style = document.createElement('style');
      style.id = 'dust-style';
      style.textContent = `
        @keyframes dustFloat {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.1; }
          25% { transform: translate(20px, -30px) scale(1.2); opacity: 0.3; }
          50% { transform: translate(-10px, -50px) scale(0.8); opacity: 0.2; }
          75% { transform: translate(15px, -20px) scale(1.1); opacity: 0.15; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  destroy() {
    if (this.overlay) this.overlay.remove();
  }
}
