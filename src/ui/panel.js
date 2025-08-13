// src/ui/panel.js
/**
 * Uniform, minimal DOM helpers + a single-source-of-truth "pushOverlay()" dispatcher.
 * Exposes values(): { count, power, showPaths, spin, frameScale, expanderXBoost, expanderYBoost, ...existing }
 *
 * No breaking renames. Existing IDs kept when present; new ones are additive.
 */
export function initUI({
  overlayControls = false,
  onOverlayChange = () => {},
  onOverlayDump = () => {},
} = {}) {
  // ----- Existing controls (kept) -----
  const countSlider = document.getElementById('count');
  const powerSlider = document.getElementById('power');
  const countLabel  = document.getElementById('countLabel');
  const powerLabel  = document.getElementById('powerLabel');
  const showPaths   = document.getElementById('showPaths');
  const spinCards   = document.getElementById('spinCards');
  const resetBtn    = document.getElementById('resetBtn');

  const setLabels = () => {
    if (countLabel && countSlider) countLabel.textContent = String(countSlider.value);
    if (powerLabel && powerSlider) powerLabel.textContent = String(powerSlider.value);
  };
  setLabels();

  // ----- Overlay panel (new UI is additive; no breaking renames) -----
  let overlayElems = null;

  if (overlayControls) {
    const uiRoot = document.getElementById('ui');

    const panel = document.createElement('div');
    panel.className = 'panel';

    // Uniform markup with data-ids; innerHTML for brevity, then we cache elements.
    panel.innerHTML = `
      <h1 style="display:flex;align-items:center;gap:8px;">Overlay Frame <span class="pill">HUD</span></h1>
      <div class="small">16-piece GLB frame that sticks to camera. Use these to debug fitting.</div>

      <label>Frame Distance <span id="frameDistLabel">2.00</span></label>
      <input id="frameDist" type="range" min="0.25" max="8" step="0.01" value="2.00" />

      <label>Fill Mode</label>
      <select id="fillMode">
        <!-- Keep original option values to avoid breaking setFillMode's logic -->
        <option value="mainsFill">Mains fill (expanders off)</option>
        <option value="expandersFill" selected>Expanders fill (mains native)</option>
      </select>

      <label>Margins H / V <span id="marginLabel">1% / 1%</span></label>
      <div class="row" style="gap:6px;">
        <input id="marginH" type="range" min="0" max="0.2" step="0.005" value="0.01" />
        <input id="marginV" type="range" min="0" max="0.2" step="0.005" value="0.01" />
      </div>

      <label>Lighting</label>
      <select id="lighting">
        <option value="unlit">Unlit (texture only)</option>
        <option value="normals" selected>Normals mix</option>
        <option value="keep">Keep materials</option>
      </select>

      <label>Normals Mix <span id="mixLabel">0.60</span></label>
      <input id="mix" type="range" min="0" max="1" step="0.01" value="0.60" />

      <div class="row">
        <input id="debugPivots" type="checkbox" />
        <label for="debugPivots" style="margin:0;flex:1">Show pivot circles</label>
      </div>
      <div class="row">
        <input id="debugBounds" type="checkbox" />
        <label for="debugBounds" style="margin:0;flex:1">Show bounds</label>
      </div>

      <hr style="opacity:.15;margin:10px 0"/>

      <!-- NEW: manual override helpers for debugging fit without touching overlay math -->
      <label>Frame Scale Bias × <span id="scaleBiasLabel">1.00</span></label>
      <input id="scaleBias" type="range" min="0.50" max="2.00" step="0.01" value="1.00" />

      <label>Horizontal Expander Boost × <span id="expXLabel">1.00</span></label>
      <input id="expanderXBoost" type="range" min="1.00" max="3.00" step="0.01" value="1.00" />

      <label>Vertical Expander Boost × <span id="expYLabel">1.00</span></label>
      <input id="expanderYBoost" type="range" min="1.00" max="3.00" step="0.01" value="1.00" />

      <div class="row" style="margin-top:8px;">
        <input id="dumpOverlayBtn" type="button" value="Dump Overlay Debug" />
      </div>
    `;

    uiRoot.insertBefore(panel, uiRoot.firstChild);

    // Cache elements
    const els = {
      frameDist:      panel.querySelector('#frameDist'),
      frameDistLabel: panel.querySelector('#frameDistLabel'),

      fillModeSel:    panel.querySelector('#fillMode'),

      marginH:        panel.querySelector('#marginH'),
      marginV:        panel.querySelector('#marginV'),
      marginLabel:    panel.querySelector('#marginLabel'),

      lightingSel:    panel.querySelector('#lighting'),
      mix:            panel.querySelector('#mix'),
      mixLabel:       panel.querySelector('#mixLabel'),

      debugPivots:    panel.querySelector('#debugPivots'),
      debugBounds:    panel.querySelector('#debugBounds'),

      // NEW
      scaleBias:      panel.querySelector('#scaleBias'),
      scaleBiasLabel: panel.querySelector('#scaleBiasLabel'),
      expanderXBoost: panel.querySelector('#expanderXBoost'),
      expXLabel:      panel.querySelector('#expXLabel'),
      expanderYBoost: panel.querySelector('#expanderYBoost'),
      expYLabel:      panel.querySelector('#expYLabel'),

      dumpOverlayBtn: panel.querySelector('#dumpOverlayBtn'),
    };

    // Central dispatcher
    const pushOverlay = () => {
      const payload = {
        frameDistance: parseFloat(els.frameDist.value),
        fillMode:      els.fillModeSel.value,             // 'mainsFill' or 'expandersFill' (overlay maps this to expandersOnly)
        marginH:       parseFloat(els.marginH.value),
        marginV:       parseFloat(els.marginV.value),
        lighting:      els.lightingSel.value,
        mixStrength:   parseFloat(els.mix.value),
        debugPivots:   !!els.debugPivots.checked,
        debugBounds:   !!els.debugBounds.checked,

        // NEW debug assists (handled in main.js after overlay.update()):
        frameScale:       parseFloat(els.scaleBias.value),
        expanderXBoost:   parseFloat(els.expanderXBoost.value),
        expanderYBoost:   parseFloat(els.expanderYBoost.value),
      };
      onOverlayChange(payload);
    };

    // Wire events (uniform, minimal work per event)
    els.frameDist.addEventListener('input', () => {
      els.frameDistLabel.textContent = Number(els.frameDist.value).toFixed(2);
      pushOverlay();
    });
    els.fillModeSel.addEventListener('change', pushOverlay);
    els.lightingSel.addEventListener('change', pushOverlay);
    els.mix.addEventListener('input', () => {
      els.mixLabel.textContent = Number(els.mix.value).toFixed(2);
      pushOverlay();
    });
    const updateMarginLabel = () => {
      els.marginLabel.textContent =
        `${Math.round(els.marginH.value * 100)}% / ${Math.round(els.marginV.value * 100)}%`;
    };
    els.marginH.addEventListener('input', () => { updateMarginLabel(); pushOverlay(); });
    els.marginV.addEventListener('input', () => { updateMarginLabel(); pushOverlay(); });
    els.debugPivots.addEventListener('change', pushOverlay);
    els.debugBounds.addEventListener('change', pushOverlay);

    // NEW
    els.scaleBias.addEventListener('input', () => {
      els.scaleBiasLabel.textContent = Number(els.scaleBias.value).toFixed(2);
      pushOverlay();
    });
    els.expanderXBoost.addEventListener('input', () => {
      els.expXLabel.textContent = Number(els.expanderXBoost.value).toFixed(2);
      pushOverlay();
    });
    els.expanderYBoost.addEventListener('input', () => {
      els.expYLabel.textContent = Number(els.expanderYBoost.value).toFixed(2);
      pushOverlay();
    });

    els.dumpOverlayBtn.addEventListener('click', () => onOverlayDump());

    // Initial label sync + first push
    updateMarginLabel();
    pushOverlay();

    overlayElems = { ...els };
  }

  // ----- Public API (kept signature) -----
  return {
    elements: {
      countSlider, powerSlider, showPaths, spinCards, resetBtn,
      overlay: overlayElems
    },
    onInput: (fn) => {
      countSlider?.addEventListener('input', () => { setLabels(); fn(); });
      powerSlider?.addEventListener('input', setLabels);
    },
    values: () => ({
      count: countSlider?.value | 0,
      power: powerSlider?.value | 0,
      showPaths: !!showPaths?.checked,
      spin: !!spinCards?.checked,

      // If overlay is mounted, expose its debug assists as well (safe defaults otherwise)
      frameScale:       overlayElems?.scaleBias ? parseFloat(overlayElems.scaleBias.value) : 1.0,
      expanderXBoost:   overlayElems?.expanderXBoost ? parseFloat(overlayElems.expanderXBoost.value) : 1.0,
      expanderYBoost:   overlayElems?.expanderYBoost ? parseFloat(overlayElems.expanderYBoost.value) : 1.0,
    })
  };
}
