// ============================================================
// Title Screen
// ============================================================

export function showTitleScreen(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0612;z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:monospace;';

  el.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:64px;font-weight:bold;color:#e8ff47;text-shadow:0 0 40px rgba(232,255,71,0.5);letter-spacing:8px;">RIFT SEED</div>
      <div style="font-size:14px;color:#a855f7;letter-spacing:4px;margin-top:8px;">SEED GARDEN x SOLO LEVELING</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">2.5D Isometric Action RPG</div>
      <div style="margin-top:60px;font-size:16px;color:#e8ff47;animation:blink 1s infinite;">Press ENTER to Start</div>
      <div style="margin-top:40px;color:#444;font-size:11px;line-height:2;">
        <div>WASD — Move &nbsp;|&nbsp; Q — Shadow Strike &nbsp;|&nbsp; W — Rift Slash</div>
        <div>E — Heal &nbsp;|&nbsp; R — Rift Teleport &nbsp;|&nbsp; F — Interact</div>
        <div>I — Inventory &nbsp;|&nbsp; Tab — Agent Panel &nbsp;|&nbsp; 1-3 — Items</div>
        <div>P — Auto-Demo &nbsp;|&nbsp; Click — Move/Attack</div>
      </div>
      <div style="margin-top:30px;color:#333;font-size:10px;">AI Agents: Telemetry | A/B Testing | Data Pipeline</div>
    </div>
  `;

  // Add blink animation
  const style = document.createElement('style');
  style.textContent = '@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}';
  document.head.appendChild(style);

  document.body.appendChild(el);

  const handler = (e) => {
    if (e.key === 'Enter') {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onStart(); }, 500);
      window.removeEventListener('keydown', handler);
    }
  };
  window.addEventListener('keydown', handler);
}
