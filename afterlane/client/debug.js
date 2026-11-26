const searchParams = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const debugEnabled = searchParams?.get('debug') === '1';
const rawDpr = searchParams?.get('dpr');
const parsedDpr = rawDpr !== null ? Number(rawDpr) : NaN;
export const dprOverride = Number.isFinite(parsedDpr) && parsedDpr > 0 ? Math.min(parsedDpr, 3) : null;

export const debugToggles = {
  rain: true,
  shadows: true,
  fields: true,
  mirrors: true,
  bloom: true,
};

const TOGGLE_NAMES = ['rain', 'shadows', 'fields', 'mirrors', 'bloom'];

export function createDebugOverlay({ renderer, scene, camera, getQuality, setQuality, setWeather, setDistance, onToggle } = {}) {
  const stats = {
    fps: 0,
    avgMs: 0,
    frameMs: 0,
    jsMs: 0,
    renderMs: 0,
    calls: 0,
    mainCalls: 0,
    mirrorCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    dpr: 1,
    dprOverride,
    quality: 'Medium',
  };

  if (!debugEnabled) {
    return {
      record() {},
      stats,
    };
  }

  const root = document.createElement('aside');
  root.id = 'debug-overlay';
  root.setAttribute('aria-label', 'Performance profiler');

  const pre = document.createElement('pre');
  pre.className = 'debug-metrics';
  root.appendChild(pre);

  const controls = document.createElement('div');
  controls.className = 'debug-toggles';
  const buttons = {};
  for (const name of TOGGLE_NAMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.toggle = name;
    button.setAttribute('aria-pressed', String(debugToggles[name]));
    button.textContent = `${name}: ${debugToggles[name] ? 'ON' : 'OFF'}`;
    button.addEventListener('click', () => {
      debugToggles[name] = !debugToggles[name];
      button.setAttribute('aria-pressed', String(debugToggles[name]));
      button.textContent = `${name}: ${debugToggles[name] ? 'ON' : 'OFF'}`;
      onToggle?.(name, debugToggles[name]);
    });
    controls.appendChild(button);
    buttons[name] = button;
  }
  root.appendChild(controls);
  document.body.appendChild(root);

  let emaMs = 16.67;
  let lastHudAt = 0;
  let windowFrames = 0;
  let windowStart = 0;
  let windowMsSum = 0;

  const syncButtons = () => {
    for (const name of TOGGLE_NAMES) {
      const btn = buttons[name];
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(debugToggles[name]));
      btn.textContent = `${name}: ${debugToggles[name] ? 'ON' : 'OFF'}`;
    }
  };

  window.__afterlaneDebug = {
    getStats() {
      return { ...stats, toggles: { ...debugToggles } };
    },
    setToggle(name, value) {
      if (!(name in debugToggles)) return false;
      debugToggles[name] = Boolean(value);
      syncButtons();
      onToggle?.(name, debugToggles[name]);
      return debugToggles[name];
    },
    setQuality(tier) {
      setQuality?.(tier);
    },
    setWeather(weather) {
      setWeather?.(weather);
    },
    setDistance(distance) {
      setDistance?.(distance);
    },
    resetWindow() {
      windowFrames = 0;
      windowMsSum = 0;
      windowStart = performance.now();
    },
    inspectScene() {
      if (!scene) return null;
      const groups = {};
      scene.traverse(obj => {
        if (!obj.visible) return;
        let p = obj;
        while (p && !p.visible) return;
        let cur = obj;
        while (cur) { if (!cur.visible) return; cur = cur.parent; }
        if (!obj.isMesh && !obj.isLine && !obj.isPoints) return;
        if (obj.isInstancedMesh && obj.count === 0) return;
        const label = obj.name || obj.parent?.name || obj.type;
        groups[label] = (groups[label] || 0) + 1;
      });
      return {
        totalVisibleMeshes: Object.values(groups).reduce((a, b) => a + b, 0),
        groups: Object.entries(groups).sort((a, b) => b[1] - a[1]),
      };
    },
  };

  return {
    stats,
    recordPass(mirrorCalls, mainCalls, renderMs = 0) {
      stats.mirrorCalls = mirrorCalls;
      stats.mainCalls = mainCalls;
      stats.renderMs = +renderMs.toFixed(2);
    },
    record(now, frameMs, jsMs = 0) {
      if (!windowStart) windowStart = now;
      if (frameMs > 0 && frameMs < 500) {
        emaMs = emaMs * 0.9 + frameMs * 0.1;
        windowFrames += 1;
        windowMsSum += frameMs;
      }
      const elapsed = now - windowStart;
      if (elapsed >= 500 && windowFrames > 0) {
        stats.fps = Math.round((windowFrames * 1000) / elapsed);
        stats.avgMs = +(windowMsSum / windowFrames).toFixed(2);
        windowFrames = 0;
        windowMsSum = 0;
        windowStart = now;
      } else if (!stats.avgMs) {
        stats.avgMs = +emaMs.toFixed(2);
        stats.fps = Math.round(1000 / Math.max(1, emaMs));
      }
      stats.frameMs = +frameMs.toFixed(2);
      stats.jsMs = +jsMs.toFixed(2);
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.geometries = renderer.info.memory.geometries;
      stats.textures = renderer.info.memory.textures;
      stats.dpr = +renderer.getPixelRatio().toFixed(2);
      stats.quality = getQuality();

      if (now - lastHudAt >= 200) {
        lastHudAt = now;
        pre.textContent =
          `FPS ${String(stats.fps).padStart(3)} | ${stats.avgMs.toFixed(1)}ms (JS ${stats.jsMs.toFixed(1)}ms / R ${stats.renderMs.toFixed(1)}ms)\n` +
          `Calls ${stats.calls} | Tris ${stats.triangles.toLocaleString()}\n` +
          `Geom ${stats.geometries} | Tex ${stats.textures}\n` +
          `Tier ${stats.quality} | DPR ${stats.dpr.toFixed(2)}${dprOverride ? ' [LOCK]' : ''}`;
      }
    },
  };
}
