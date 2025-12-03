import './styles/main.css';
import { createSceneManager } from './sceneManager.js';
import { createUIManager } from './ui.js';
import { createQueryHandler } from './query.js';

// Shared state for the app
const app = {
  plyFiles: ['/B3_S4.ply', '/B3_S2.ply', '/B3_S5.ply'],
  loadedFiles: new Map(),
  renderMode: 'points',
  colorMode: 'original',
  qualityMode: 'downsampled',
  selectedFile: null,
  sceneInfo: null,
  highlightBoxes: new Map(),
  currentMode: 'orbit',
};

// Instantiate managers
app.sceneManager = createSceneManager(app, null);
app.ui = createUIManager(app, app.sceneManager, null);
// Ensure scene manager knows about the UI (set after both are created)
if (app.sceneManager && app.sceneManager.setUI) app.sceneManager.setUI(app.ui);
app.query = createQueryHandler(app, app.sceneManager, app.ui);

// Start managers and load files
app.sceneManager.init();
(async function start() {
  await loadSceneInfo();
  app.ui.createFileCheckboxes();
  app.sceneManager.loadAllPLYFiles();
})();

window.__app = app;

async function loadSceneInfo() {
  try {
    const resp = await fetch('/info.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    app.sceneInfo = json;
    app.sceneInfo._map = new Map();
    app.sceneInfo.displayNames = new Map();
    if (json.name) {
      for (const key of Object.keys(json.name)) {
        const val = json.name[key];
        const filenameLower = String(val).toLowerCase();
        const keyLower = String(key).toLowerCase();
        app.sceneInfo._map.set(keyLower, { key, filename: val });
        app.sceneInfo._map.set(filenameLower, { key, filename: val });
        const basename = filenameLower.replace(/\.ply$/i, '');
        app.sceneInfo._map.set(basename, { key, filename: val });
        const tokens = new Set([...basename.split(/[^a-z0-9]+/), ...keyLower.split(/[^a-z0-9]+/)]);
        for (const t of tokens) if (t && t.length > 0) app.sceneInfo._map.set(t, { key, filename: val });
        const existing = app.sceneInfo.displayNames.get(val) || [];
        if (!existing.includes(key)) existing.push(key);
        app.sceneInfo.displayNames.set(val, existing);
      }
    }
    if (json.bounding_box)
      for (const key of Object.keys(json.bounding_box))
        app.sceneInfo._map.set(key.toLowerCase(), { key, filename: json.name?.[key] });
    if (json.labels) {
      for (const [fn, labels] of Object.entries(json.labels)) {
        for (const lab of labels) app.sceneInfo._map.set(String(lab).toLowerCase(), { key: Object.keys(json.name).find(k => json.name[k] === fn) || String(lab).toLowerCase(), filename: fn });
        const existing = app.sceneInfo.displayNames.get(fn) || [];
        for (const lab of labels) if (!existing.includes(lab)) existing.push(lab);
        app.sceneInfo.displayNames.set(fn, existing);
      }
    }
    console.log('[Main] Scene info.json loaded', app.sceneInfo);
  } catch (err) {
    console.warn('[Main] Could not load info.json (not present or failed to parse). Will generate from loaded PLY files.', err);
    app.sceneInfo = { name: {}, bounding_box: {}, labels: {}, _map: new Map(), displayNames: new Map() };
  }
}

export default app;
