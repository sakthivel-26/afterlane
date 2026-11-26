import * as T from 'three';

const zones = ['steer', 'shifter', 'pedals'];

export function defaultControllerLayout() {
  return {
    steer: { x: null, y: null, scale: 1 },
    shifter: { x: null, y: null, scale: 1 },
    pedals: { x: null, y: null, scale: 1 },
  };
}

export function normalizeControllerLayout(settings) {
  const base = defaultControllerLayout();
  const saved = settings.controllerLayout && typeof settings.controllerLayout === 'object' ? settings.controllerLayout : {};
  const legacyScale = Number.isFinite(settings.controllerSize) ? T.MathUtils.clamp(settings.controllerSize / 100, .55, 1.85) : 1;
  const legacyZoneScale = (field) => Number.isFinite(settings[field]) ? T.MathUtils.clamp(legacyScale * (settings[field] / 100), .55, 1.85) : 1;
  const fallbackScale = {
    steer: legacyZoneScale('steeringSize'),
    shifter: legacyZoneScale('shifterSize'),
    pedals: legacyZoneScale('pedalSize'),
  };
  for (const key of zones) {
    const entry = saved[key] && typeof saved[key] === 'object' ? saved[key] : {};
    base[key] = {
      x: Number.isFinite(entry.x) ? T.MathUtils.clamp(entry.x, 4, 96) : null,
      y: Number.isFinite(entry.y) ? T.MathUtils.clamp(entry.y, 6, 94) : null,
      scale: Number.isFinite(entry.scale) ? T.MathUtils.clamp(entry.scale, .55, 1.85) : fallbackScale[key],
    };
  }
  settings.controllerLayout = base;
}

export function applyControllerLayout(settings) {
  normalizeControllerLayout(settings);
  const { steer, shifter, pedals } = settings.controllerLayout;
  const root = document.documentElement.style;
  root.setProperty('--touch-scale', '1');
  root.setProperty('--steer-scale', steer.scale.toFixed(3));
  root.setProperty('--gear-scale', shifter.scale.toFixed(3));
  root.setProperty('--pedal-scale', pedals.scale.toFixed(3));
  root.setProperty('--touch-opacity', String((Number.isFinite(settings.controlsOpacity) ? settings.controlsOpacity : 100) / 100));

  for (const key of zones) {
    const el = document.querySelector(`[data-zone="${key}"]`);
    if (!el) continue;
    const cfg = settings.controllerLayout[key];
    if (cfg.x !== null && cfg.y !== null) {
      el.dataset.customPos = 'true';
      el.style.setProperty('--zone-x', `${cfg.x.toFixed(2)}%`);
      el.style.setProperty('--zone-y', `${cfg.y.toFixed(2)}%`);
    } else {
      delete el.dataset.customPos;
      el.style.removeProperty('--zone-x');
      el.style.removeProperty('--zone-y');
    }
  }
}

export function createLayoutEditor(settings, { pause, save, syncUI }) {
  const touch = document.querySelector('#touch-drive');
  const bar = document.querySelector('#touch-editor-bar');
  const styleBtn = document.querySelector('#editor-style');
  const transBtn = document.querySelector('#editor-trans');
  const inputBtn = document.querySelector('#editor-input');
  const resetBtn = document.querySelector('#editor-reset');
  const doneBtn = document.querySelector('#editor-done');

  let active = false;
  let wasPlayingTouchHidden = true;

  function updateToolbarLabels() {
    if (styleBtn) styleBtn.textContent = `Steer: ${settings.controllerStyle}`;
    if (transBtn) transBtn.textContent = `Gear: ${settings.transmission === 'Manual' ? 'Manual' : 'Auto'}`;
    if (inputBtn) inputBtn.textContent = `Input: ${settings.steering}`;
    const wheelEl = document.querySelector('#touch-wheel');
    const arrowsEl = document.querySelector('#touch-arrows');
    if (wheelEl && arrowsEl) {
      const arrows = settings.controllerStyle === 'Arrows';
      wheelEl.hidden = arrows;
      arrowsEl.hidden = !arrows;
    }
  }

  function closeEditor() {
    if (!active) return;
    active = false;
    document.body.classList.remove('editing-controls');
    if (bar) bar.hidden = true;
    if (touch) touch.hidden = wasPlayingTouchHidden;
    applyControllerLayout(settings);
    save();
    syncUI?.();
  }

  function openEditor() {
    const panel = document.querySelector('#panel');
    if (panel?.open) panel.close();
    pause();
    if (active) return;
    wasPlayingTouchHidden = touch ? touch.hidden : true;
    active = true;
    document.body.classList.add('editing-controls');
    if (touch) touch.hidden = false;
    if (bar) bar.hidden = false;
    applyControllerLayout(settings);
    updateToolbarLabels();
  }

  for (const key of zones) {
    const el = document.querySelector(`[data-zone="${key}"]`);
    if (!el) continue;
    const pointers = new Map();
    let mode = null;
    let dragStart = null;
    let resizeStart = null;
    let pinchStart = null;

    const handle = el.querySelector('.zone-resize');

    const startMove = (e) => {
      const rect = el.getBoundingClientRect();
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const cfg = settings.controllerLayout[key];
      if (cfg.x === null || cfg.y === null) {
        cfg.x = ((rect.left + rect.width * .5) / vw) * 100;
        cfg.y = ((rect.top + rect.height * .5) / vh) * 100;
        applyControllerLayout(settings);
      }
      mode = 'move';
      dragStart = {
        px: e.clientX,
        py: e.clientY,
        x: cfg.x,
        y: cfg.y,
        halfW: rect.width * .5,
        halfH: rect.height * .5,
      };
    };

    el.addEventListener('pointerdown', (e) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (e.target.closest('.zone-resize')) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width * .5;
        const cy = rect.top + rect.height * .5;
        mode = 'resize';
        resizeStart = {
          cx,
          cy,
          dist: Math.max(20, Math.hypot(e.clientX - cx, e.clientY - cy)),
          scale: settings.controllerLayout[key].scale,
        };
        return;
      }

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        mode = 'pinch';
        pinchStart = {
          dist: Math.max(20, Math.hypot(b.x - a.x, b.y - a.y)),
          scale: settings.controllerLayout[key].scale,
        };
        return;
      }

      startMove(e);
    });

    el.addEventListener('pointermove', (e) => {
      if (!active || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const cfg = settings.controllerLayout[key];
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);

      if (mode === 'pinch' && pointers.size >= 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y));
        cfg.scale = T.MathUtils.clamp(pinchStart.scale * (dist / pinchStart.dist), .55, 1.85);
        applyControllerLayout(settings);
        save();
        return;
      }

      if (mode === 'resize' && resizeStart) {
        const dist = Math.max(14, Math.hypot(e.clientX - resizeStart.cx, e.clientY - resizeStart.cy));
        cfg.scale = T.MathUtils.clamp(resizeStart.scale * (dist / resizeStart.dist), .55, 1.85);
        applyControllerLayout(settings);
        save();
        return;
      }

      if (mode === 'move' && dragStart) {
        const minX = Math.min(45, (Math.min(dragStart.halfW, vw * .4) + 6) / vw * 100);
        const minY = Math.min(45, (Math.min(dragStart.halfH, vh * .4) + 6) / vh * 100);
        const nextX = dragStart.x + ((e.clientX - dragStart.px) / vw) * 100;
        const nextY = dragStart.y + ((e.clientY - dragStart.py) / vh) * 100;
        cfg.x = T.MathUtils.clamp(nextX, minX, 100 - minX);
        cfg.y = T.MathUtils.clamp(nextY, minY, 100 - minY);
        applyControllerLayout(settings);
        save();
      }
    });

    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        mode = null;
        dragStart = null;
        resizeStart = null;
        pinchStart = null;
      } else if (pointers.size === 1 && mode === 'pinch') {
        const [remainingId, pos] = [...pointers.entries()][0];
        startMove({ clientX: pos.x, clientY: pos.y, pointerId: remainingId });
      }
    };
    for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(evt, endPointer);
    }
    if (handle) handle.tabIndex = 0;
  }

  styleBtn?.addEventListener('click', () => {
    settings.controllerStyle = settings.controllerStyle === 'Wheel' ? 'Arrows' : 'Wheel';
    save();
    updateToolbarLabels();
  });
  transBtn?.addEventListener('click', () => {
    settings.transmission = settings.transmission === 'Manual' ? 'Automatic' : 'Manual';
    save();
    updateToolbarLabels();
  });
  inputBtn?.addEventListener('click', () => {
    settings.steering = settings.steering === 'Touch' ? 'Tilt' : 'Touch';
    if (settings.steering === 'Tilt' && typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
      window.DeviceOrientationEvent.requestPermission().catch(() => {});
    }
    save();
    updateToolbarLabels();
  });
  resetBtn?.addEventListener('click', () => {
    settings.controllerLayout = defaultControllerLayout();
    applyControllerLayout(settings);
    save();
  });
  doneBtn?.addEventListener('click', closeEditor);

  window.addEventListener('keydown', (e) => {
    if (active && e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeEditor();
    }
  }, true);

  return {
    open: openEditor,
    close: closeEditor,
    get isOpen() { return active; },
  };
}
