// src/ui/panel.js
/**
 * Adds the existing controls AND (optionally) an Overlay debug/control panel.
 * No changes to index.html required; we append our extra panel dynamically.
 */
export function initUI({
  overlayControls = false,
  onOverlayChange = () => {},
  onOverlayDump = () => {},
} = {}) {
  const countSlider = document.getElementById('count');
  const powerSlider = document.getElementById('power');
  const countLabel  = document.getElementById('countLabel');
  const powerLabel  = document.getElementById('powerLabel');
  const showPaths   = document.getElementById('showPaths');
  const spinCards   = document.getElementById('spinCards');
  const resetBtn    = document.getElementById('resetBtn');

  const setLabels = () => {
    countLabel.textContent = countSlider.value;
    powerLabel.textContent = powerSlider.value;
  };
  setLabels();

  // ---- Overlay panel (dynamic) ----
  let overlayElems = null;
  if (overlayControls) {
    const uiRoot = document.getElementById('ui');

    const panel = document.createElement('div');
    panel.className = 'panel';

    panel.innerHTML = `
      <h1 style="display:flex;align-items:center;gap:8px;">Overlay Frame <span class="pill">HUD</span></h1>
      <div class="small">Modular 16-GLB frame that sticks to camera. Use these controls to diagnose layout.</div>

      <label>Frame Distance <span id="frameDistLabel">2.00</span></label>
      <input id="frameDist" type="range" min="0.25" max="8" step="0.01" value="2.00" />

      <label>Fill Mode</label>
      <select id="fillMode">
        <option value="mainsFill" selected>Mains fill (expanders off)</option>
        <option value="expandersFill">Expanders fill (mains native)</option>
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

      <div class="row">
        <input id="dumpOverlayBtn" type="button" value="Dump Overlay Debug" />
      </div>
    `;

    uiRoot.insertBefore(panel, uiRoot.firstChild);

    // Hook elements
    const frameDist = panel.querySelector('#frameDist');
    const frameDistLabel = panel.querySelector('#frameDistLabel');
    const fillModeSel = panel.querySelector('#fillMode');
    const marginH = panel.querySelector('#marginH');
    const marginV = panel.querySelector('#marginV');
    const marginLabel = panel.querySelector('#marginLabel');
    const lightingSel = panel.querySelector('#lighting');
    const mix = panel.querySelector('#mix');
    const mixLabel = panel.querySelector('#mixLabel');
    const debugPivots = panel.querySelector('#debugPivots');
    const debugBounds = panel.querySelector('#debugBounds');
    const dumpOverlayBtn = panel.querySelector('#dumpOverlayBtn');

    const pushOverlay = () => {
      onOverlayChange({
        frameDistance: parseFloat(frameDist.value),
        fillMode: fillModeSel.value,
        marginH: parseFloat(marginH.value),
        marginV: parseFloat(marginV.value),
        lighting: lightingSel.value,
        mixStrength: parseFloat(mix.value),
        debugPivots: !!debugPivots.checked,
        debugBounds: !!debugBounds.checked,
      });
    };

    // Wire events
    frameDist.addEventListener('input', () => {
      frameDistLabel.textContent = Number(frameDist.value).toFixed(2);
      pushOverlay();
    });
    fillModeSel.addEventListener('change', pushOverlay);
    lightingSel.addEventListener('change', pushOverlay);
    mix.addEventListener('input', () => {
      mixLabel.textContent = Number(mix.value).toFixed(2);
      pushOverlay();
    });
    marginH.addEventListener('input', () => {
      marginLabel.textContent = `${Math.round(marginH.value*100)}% / ${Math.round(marginV.value*100)}%`;
      pushOverlay();
    });
    marginV.addEventListener('input', () => {
      marginLabel.textContent = `${Math.round(marginH.value*100)}% / ${Math.round(marginV.value*100)}%`;
      pushOverlay();
    });
    debugPivots.addEventListener('change', pushOverlay);
    debugBounds.addEventListener('change', pushOverlay);

    dumpOverlayBtn.addEventListener('click', () => onOverlayDump());

    // Initial push
    pushOverlay();

    overlayElems = {
      frameDist, fillModeSel, lightingSel, mix, debugPivots, debugBounds, marginH, marginV
    };
  }

  // ---- Existing API (unchanged) ----
  return {
    elements: { countSlider, powerSlider, showPaths, spinCards, resetBtn, overlay: overlayElems },
    onInput: (fn) => {
      countSlider.addEventListener('input', () => { setLabels(); fn(); });
      powerSlider.addEventListener('input', setLabels);
    },
    values: () => ({
      count: countSlider.value | 0,
      power: powerSlider.value | 0,
      showPaths: !!showPaths.checked,
      spin: !!spinCards.checked
    })
  };
}
