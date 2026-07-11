// ============================================================
// Purchase Simulator — mock IAP UI
// ============================================================
import { PREMIUM_PACKAGES } from '@rift-seed/shared/config';
import { EventType, createEvent } from '@rift-seed/shared/events';

export class PurchaseSimulator {
  constructor(inventory, emitEvent) {
    this.inventory = inventory;
    this.emitEvent = emitEvent;
    this.visible = false;
    this.el = null;
  }

  init() {
    this.el = document.createElement('div');
    this.el.id = 'purchase-ui';
    this.el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,6,18,0.95);z-index:700;display:none;align-items:center;justify-content:center;font-family:monospace;';
    document.body.appendChild(this.el);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'flex' : 'none';
    if (this.visible) this.render();
  }

  render() {
    let html = `<div style="text-align:center;max-width:700px;width:100%;padding:20px;">`;
    html += `<div style="font-size:24px;color:#e8ff47;font-weight:bold;margin-bottom:4px;">RIFT CRYSTALS</div>`;
    html += `<div style="font-size:11px;color:#666;margin-bottom:20px;">DEMO — No Real Purchase</div>`;
    html += `<div style="font-size:14px;color:#a855f7;margin-bottom:24px;">Your Crystals: ${this.inventory.crystals}</div>`;

    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">`;
    for (const pkg of PREMIUM_PACKAGES) {
      const border = pkg.popular ? '#e8ff47' : '#333';
      const glow = pkg.popular ? 'box-shadow:0 0 20px rgba(232,255,71,0.2);' : '';
      html += `<div style="background:#1a1a2a;border:2px solid ${border};border-radius:8px;padding:20px;position:relative;cursor:pointer;${glow}" data-pkg="${pkg.id}">`;
      if (pkg.popular) html += `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#e8ff47;color:#000;padding:2px 12px;font-size:9px;font-weight:bold;border-radius:3px;">BEST VALUE</div>`;
      html += `<div style="font-size:13px;color:#fff;margin-bottom:8px;">${pkg.name}</div>`;
      html += `<div style="font-size:28px;color:#a855f7;font-weight:bold;">${pkg.crystals}</div>`;
      html += `<div style="font-size:10px;color:#888;margin-bottom:12px;">Rift Crystals</div>`;
      html += `<div style="font-size:16px;color:#e8ff47;">${pkg.price}</div>`;
      html += `</div>`;
    }
    html += `</div>`;

    html += `<div style="margin-top:20px;padding:8px;background:rgba(168,85,247,0.1);border:1px dashed #a855f7;border-radius:4px;font-size:10px;color:#a855f7;">`;
    html += `Spend crystals on: Legendary Weapons • XP Boosts • Rank Skins • Exclusive Skills</div>`;

    html += `<div style="margin-top:20px;font-size:12px;color:#666;cursor:pointer;" id="purchase-close">Close</div>`;
    html += `</div>`;

    this.el.innerHTML = html;

    this.el.querySelector('#purchase-close')?.addEventListener('click', () => this.toggle());
    this.el.querySelectorAll('[data-pkg]').forEach(card => {
      card.addEventListener('click', () => {
        const pkg = PREMIUM_PACKAGES.find(p => p.id === card.dataset.pkg);
        if (pkg) {
          this.inventory.crystals += pkg.crystals;
          this.emitEvent(createEvent(EventType.ITEM_PURCHASE, 'player', { package: pkg.id, crystals: pkg.crystals, price: pkg.price }));
          this.render();
          // Success flash
          card.style.borderColor = '#44ff44';
          setTimeout(() => card.style.borderColor = pkg.popular ? '#e8ff47' : '#333', 500);
        }
      });
    });
  }
}
