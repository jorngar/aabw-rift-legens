// ============================================================
// Title Screen with Story Intro
// ============================================================

export function showTitleScreen(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0612;z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:monospace;overflow:hidden;';

  el.innerHTML = `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;height:300px;border-radius:50%;background:radial-gradient(ellipse,rgba(168,85,247,0.15) 0%,rgba(74,158,255,0.05) 50%,transparent 70%);animation:portalGlow 4s ease-in-out infinite;pointer-events:none;"></div>
    <div id="title-content" style="text-align:center;opacity:0;transition:opacity 1.5s;position:relative;z-index:1;">
      <div style="font-size:72px;font-weight:bold;color:#e8ff47;text-shadow:0 0 60px rgba(232,255,71,0.4),0 0 120px rgba(232,255,71,0.2);letter-spacing:12px;">RIFT SEED</div>
      <div style="font-size:14px;color:#a855f7;letter-spacing:6px;margin-top:12px;">SEED GARDEN x SOLO LEVELING</div>
      <div style="font-size:11px;color:#555;margin-top:6px;">2.5D Isometric Action RPG — AI-Powered Analytics</div>
    </div>

    <div id="story-panel" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;flex-direction:column;opacity:0;transition:opacity 2s;pointer-events:none;z-index:2;">
      <div id="story-title" style="font-size:48px;font-weight:bold;color:#e8ff47;text-shadow:0 0 40px rgba(232,255,71,0.3);letter-spacing:8px;margin-bottom:30px;opacity:0;transition:opacity 1s;">RIFT SEED</div>
      <div style="max-width:600px;text-align:center;padding:40px;">
        <div id="story-text" style="color:#aaa;font-size:14px;line-height:2;"></div>
      </div>
    </div>

    <div id="controls-panel" style="position:absolute;bottom:40px;opacity:0;transition:opacity 1s;z-index:3;">
      <div style="text-align:center;">
        <div style="font-size:48px;font-weight:bold;color:#e8ff47;text-shadow:0 0 40px rgba(232,255,71,0.3);letter-spacing:8px;margin-bottom:16px;">RIFT SEED</div>
        <div style="font-size:12px;color:#a855f7;letter-spacing:4px;margin-bottom:24px;">SEED GARDEN x SOLO LEVELING — AI-Powered Analytics</div>
        <div style="font-size:16px;color:#e8ff47;animation:blink 1.5s infinite;">Press ENTER to Begin</div>
        <div style="margin-top:20px;color:#555;font-size:11px;line-height:2.2;">
          <div>WASD — Move &nbsp;|&nbsp; Click — Move/Attack &nbsp;|&nbsp; Q — Shadow Strike</div>
          <div>W — Rift Slash &nbsp;|&nbsp; E — Seed Heal &nbsp;|&nbsp; R — Rift Teleport</div>
          <div>F — Interact &nbsp;|&nbsp; I — Inventory &nbsp;|&nbsp; Tab — Agent Panel</div>
          <div>1/2/3 — Use Items &nbsp;|&nbsp; P — Purchase UI &nbsp;|&nbsp; Shift+P — Auto Demo</div>
        </div>
        <div style="margin-top:16px;color:#333;font-size:10px;">Three AI Agents: Telemetry | A/B Testing | Data Pipeline</div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes portalGlow{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.5}50%{transform:translate(-50%,-50%) scale(1.2);opacity:0.8}}`;
  document.head.appendChild(style);

  document.body.appendChild(el);

  // Animation sequence
  const titleContent = el.querySelector('#title-content');
  const storyPanel = el.querySelector('#story-panel');
  const storyText = el.querySelector('#story-text');
  const controlsPanel = el.querySelector('#controls-panel');

  const storyLines = [
    'In the year 2087, the Rifts opened.',
    '',
    'Dimensional tears scattered across the world,',
    'spawning monsters from the Shadow Realm.',
    '',
    'The SEED Academy trains elite hunters —',
    'warriors who enter the Rifts to push back the darkness.',
    '',
    'You are a newly ranked Cadet.',
    'Your first mission awaits.',
    '',
    'But these Rifts hold secrets beyond imagination...',
    'and three AI observers watch your every move.',
  ];

  // Phase 1: Show title
  setTimeout(() => { titleContent.style.opacity = '1'; }, 500);

  // Phase 2: Fade title, show story
  setTimeout(() => {
    titleContent.style.opacity = '0';
    setTimeout(() => {
      // Show story with title
      storyPanel.style.opacity = '1';
      const storyTitle = el.querySelector('#story-title');
      if (storyTitle) storyTitle.style.opacity = '1';
      storyPanel.style.pointerEvents = 'auto';

      // Type out story lines
      let lineIdx = 0;
      const typeLine = () => {
        if (lineIdx >= storyLines.length) {
          // Story done, show controls
          setTimeout(() => {
            storyPanel.style.opacity = '0';
            setTimeout(() => {
              controlsPanel.style.opacity = '1';
            }, 1000);
          }, 2000);
          return;
        }

        const line = storyLines[lineIdx];
        if (line === '') {
          storyText.innerHTML += '<br>';
          lineIdx++;
          setTimeout(typeLine, 300);
          return;
        }

        const lineEl = document.createElement('div');
        lineEl.style.opacity = '0';
        lineEl.style.transition = 'opacity 1s';
        lineEl.textContent = line;
        storyText.appendChild(lineEl);
        requestAnimationFrame(() => { lineEl.style.opacity = '1'; });

        lineIdx++;
        setTimeout(typeLine, 1800);
      };

      typeLine();
    }, 1000);
  }, 4000);

  // Handle Enter key — with error protection
  let started = false;
  const handler = (e) => {
    if (e.key === 'Enter' && !started) {
      started = true;
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '0';
      window.removeEventListener('keydown', handler);
      setTimeout(() => {
        el.remove();
        try {
          onStart();
        } catch (err) {
          console.error('[RiftSEED] Game init failed:', err);
          // Show error instead of blank screen
          const errEl = document.createElement('div');
          errEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff4444;font-family:monospace;font-size:14px;text-align:center;';
          errEl.textContent = `Game init error: ${err.message}. Check console.`;
          document.body.appendChild(errEl);
        }
      }, 800);
    }
  };
  window.addEventListener('keydown', handler);
}
