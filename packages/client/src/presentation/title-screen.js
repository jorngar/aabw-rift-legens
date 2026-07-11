// ============================================================
// Video title screen — visual playback with resilient controls
// ============================================================

const INTRO_VIDEO = '/assets/video/intro.mp4';
const INTRO_POSTER = '/assets/video/intro-poster.png';

export function showTitleScreen(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Rift Seed. Press Enter or click to begin.');
  el.style.cssText = 'position:fixed;inset:0;background:#07040d;z-index:1000;display:grid;place-items:center;font-family:monospace;overflow:hidden;cursor:pointer;outline:none;';

  el.innerHTML = `
    <div class="intro-backdrop" aria-hidden="true"></div>
    <video
      id="intro-video"
      aria-hidden="true"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
      poster="${INTRO_POSTER}"
    >
      <source src="${INTRO_VIDEO}" type="video/mp4">
    </video>
    <div class="intro-vignette" aria-hidden="true"></div>
    <div id="intro-fallback" aria-hidden="true"></div>
    <div class="intro-focus-ring" aria-hidden="true"></div>
  `;

  const style = document.createElement('style');
  style.dataset.riftTitleStyles = 'true';
  style.textContent = `
    #title-screen .intro-backdrop,
    #title-screen .intro-vignette,
    #title-screen #intro-fallback,
    #title-screen .intro-focus-ring { position:absolute; inset:0; pointer-events:none; }
    #title-screen .intro-backdrop {
      background:linear-gradient(rgba(7,4,13,.52),rgba(7,4,13,.72)),url('${INTRO_POSTER}') center/cover;
      filter:blur(28px) saturate(.85);
      transform:scale(1.08);
      opacity:.76;
    }
    #title-screen #intro-video {
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:contain;
      z-index:1;
      filter:saturate(1.05) contrast(1.03);
    }
    #title-screen .intro-vignette {
      z-index:2;
      background:radial-gradient(circle at 50% 45%,transparent 48%,rgba(5,2,10,.3) 100%);
      box-shadow:inset 0 0 100px rgba(0,0,0,.5);
    }
    #title-screen #intro-fallback {
      z-index:1;
      display:none;
      background:#07040d url('${INTRO_POSTER}') center/contain no-repeat;
    }
    #title-screen .intro-focus-ring { z-index:3; border:2px solid transparent; transition:border-color .2s,box-shadow .2s; }
    #title-screen:focus-visible .intro-focus-ring { border-color:#e8ff47; box-shadow:inset 0 0 32px rgba(232,255,71,.16); }
    @media (max-aspect-ratio: 3/4) {
      #title-screen .intro-backdrop { display:none; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(el);

  const video = el.querySelector('#intro-video');
  const fallback = el.querySelector('#intro-fallback');
  const revealFallback = () => {
    fallback.style.display = 'block';
    video.style.display = 'none';
  };
  video.addEventListener('error', revealFallback, { once: true });
  video.play().catch(() => {
    // Browsers may defer autoplay even for muted media. The poster is a complete
    // title screen, and the first user interaction still starts the game.
    video.controls = false;
  });

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    window.removeEventListener('keydown', handleKeydown);
    el.removeEventListener('click', begin);
    video.pause();
    el.style.transition = 'opacity .55s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      style.remove();
      try {
        onStart();
      } catch (err) {
        console.error('[RiftSEED] Game init failed:', err);
        const errEl = document.createElement('div');
        errEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff6767;font-family:monospace;font-size:14px;text-align:center;';
        errEl.textContent = `Game init error: ${err.message}. Check console.`;
        document.body.appendChild(errEl);
      }
    }, 550);
  };
  const handleKeydown = (event) => {
    if (event.key === 'Enter') begin();
  };

  window.addEventListener('keydown', handleKeydown);
  el.addEventListener('click', begin);
}
