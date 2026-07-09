// ============================================================
// Title Screen with Story Intro
// ============================================================

export function showTitleScreen(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0612;z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:monospace;overflow:hidden;';

  el.innerHTML = `
    <div id="title-content" style="text-align:center;opacity:0;transition:opacity 1.5s;">
      <div style="font-size:72px;font-weight:bold;color:#e8ff47;text-shadow:0 0 60px rgba(232,255,71,0.4),0 0 120px rgba(232,255,71,0.2);letter-spacing:12px;">RIFT SEED</div>
      <div style="font-size:14px;color:#a855f7;letter-spacing:6px;margin-top:12px;">SEED GARDEN x SOLO LEVELING</div>
      <div style="font-size:11px;color:#555;margin-top:6px;">2.5D Isometric Action RPG — AI-Powered Analytics</div>
    </div>

    <div id="story-panel" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 2s;pointer-events:none;">
      <div style="max-width:600px;text-align:center;padding:40px;">
        <div id="story-text" style="color:#aaa;font-size:14px;line-height:2;"></div>
      </div>
    </div>

    <div id="controls-panel" style="position:absolute;bottom:60px;opacity:0;transition:opacity 1s;">
      <div style="text-align:center;">
        <div style="margin-top:0;font-size:16px;color:#e8ff47;animation:blink 1.5s infinite;">Press ENTER to Begin</div>
        <div style="margin-top:24px;color:#444;font-size:11px;line-height:2.2;">
          <div>WASD — Move &nbsp;|&nbsp; Click — Move/Attack &nbsp;|&nbsp; Q — Shadow Strike</div>
          <div>W — Rift Slash &nbsp;|&nbsp; E — Seed Heal &nbsp;|&nbsp; R — Rift Teleport</div>
          <div>F — Interact &nbsp;|&nbsp; I — Inventory &nbsp;|&nbsp; Tab — Agent Panel</div>
          <div>1/2/3 — Use Items &nbsp;|&nbsp; P — Purchase UI &nbsp;|&nbsp; Shift+P — Auto Demo</div>
        </div>
        <div style="margin-top:20px;color:#333;font-size:10px;">Three AI Agents: Telemetry | A/B Testing | Data Pipeline</div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`;
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
      storyPanel.style.opacity = '1';
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

  // Handle Enter key
  const handler = (e) => {
    if (e.key === 'Enter') {
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onStart(); }, 800);
      window.removeEventListener('keydown', handler);
    }
  };
  window.addEventListener('keydown', handler);
}
