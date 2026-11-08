import { formatDuration, formatElapsed } from './format.js';

const app = document.querySelector('#app');
let invoke = null;
let listen = null;
let getCurrentWebview = null;
let open = null;
let renderQueued = false;
const SETTINGS_KEY = 'vortex-fpkg-settings-v1';
const defaultSettings = { outputFolder: '', lastInput: '', itemzflowSettings: '' };
const settings = { ...defaultSettings, ...readSettings() };

let current = {
  screen: 'ready', inputPath: '', title: '', titleId: '', outputFolder: settings.outputFolder,
  stage: 'Waiting for a game dump', percent: null, processed: 0, total: null,
  bytesPerSecond: null, eta: null, packagePath: '', packageBytes: 0, duration: 0,
  validation: '', error: '', details: '', discoveryBusy: false, candidates: [], isDropTarget: false,
  demo: false, demoSource: ''
};

function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveSettings() {
  settings.outputFolder = current.outputFolder;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function basename(path = '') { return path.split(/[\\/]/).filter(Boolean).at(-1) || path; }
function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatRate(bytesPerSecond) {
  return Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : 'Calculating…';
}
function eventText(event) {
  const labels = {
    preparing: 'Preparing package',
    'writing-files': 'Writing game files',
    'writing-image': 'Assembling package image',
    signing: 'Signing package filesystem',
    encrypting: 'Encrypting package filesystem',
    'playgo-digests': 'Verifying PlayGo data',
    finalizing: 'Finalizing package',
    'package-written': 'Package written',
    'validation-started': 'Validating completed package'
  };
  const base = labels[event.stage] || event.stage || 'Preparing package';
  return event.scope && event.scope !== 'package' ? `${base} · ${event.scope}` : base;
}

function render() {
  if (current.screen === 'processing' || current.screen === 'demo-processing') return renderProcessing();
  if (current.screen === 'complete' || current.screen === 'demo-complete') return renderComplete();
  if (current.screen === 'error' || current.screen === 'demo-error') return renderError();
  if (current.screen === 'demo-menu') return renderDemoMenu();
  return renderReady();
}

function renderNextFrame() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function shell(content, demo = false) {
  return `<div class="shell ${demo ? 'shell-demo' : ''}">
    <header class="topbar">
      <a class="brand" href="#" aria-label="FPKG Builder"><span class="brand-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 9 23 12v22L32 55 9 43V21L32 9Z"/><path d="M9 21l23 13 23-13M32 34v21M21 15l23 13"/></svg></span><span class="brand-copy"><strong>FPKG BUILDER</strong><small>ITEMZFLOW PACKAGING</small></span></a>
      <div class="topbar-right"><span class="engine-status"><i></i> LibOrbisPkg engine</span>${demo ? '<span class="demo-pill">DEMO PREVIEW</span>' : ''}</div>
    </header>
    <main class="main-content">${content}</main>
    <footer class="footer"><span>Built for Itemzflow dumps</span><span>Package validation does not guarantee PS4 installation</span></footer>
  </div>`;
}

function renderReady() {
  app.innerHTML = shell(`<section class="welcome">
    <div class="eyebrow"><span class="eyebrow-line"></span> FINISH THE PACKAGING WORK</div>
    <h1>From game dump<br><span>to fPKG.</span></h1>
    <p class="welcome-copy">Drop an Itemzflow dump or its GP4 project. We’ll prepare, build and validate the package automatically.</p>
  </section>
  <section class="dropzone ${current.isDropTarget ? 'dropzone-active' : ''}" id="dropzone" aria-label="Drop a game dump here">
    <div class="drop-orbit"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="drop-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></span></div>
    <h2>${current.isDropTarget ? 'Release to start processing' : 'Drop your Itemzflow game dump here'}</h2>
    <p>Game folder or <code>.gp4</code> project · processing starts automatically</p>
    <div class="browse-row"><button class="button button-primary" id="browse-folder"><span class="button-icon">⌕</span> Browse game folder</button><button class="button button-secondary" id="browse-gp4">Choose GP4</button></div>
    <div class="drop-foot"><span><i class="tiny-check"></i> Existing Itemzflow GP4 reused</span><span><i class="tiny-check"></i> Original dump preserved</span></div>
  </section>
  <section class="path-card">
    <div class="path-card-title"><span class="path-symbol">↳</span><div><strong>Or enter a path</strong><small>Paste a folder or GP4 location</small></div></div>
    <form id="path-form" class="path-entry"><input id="input-path" value="${escapeHtml(current.inputPath || settings.lastInput)}" placeholder="/media/riley/GAMES/CUSA12345" autocomplete="off" spellcheck="false" aria-label="Game dump path"/><button class="button button-quiet" type="submit">Open path <span>→</span></button></form>
  </section>
  <section class="lower-grid">
    <div class="destination-card"><div class="mini-label">PACKAGE DESTINATION</div><div class="destination-row"><div class="folder-glyph">▱</div><div class="destination-text"><strong>${escapeHtml(current.outputFolder || 'Choose where finished fPKGs go')}</strong><small>Output stays separate from the source dump</small></div><button class="icon-button" id="browse-output" aria-label="Choose output folder" title="Choose output folder">···</button></div></div>
    <div class="detect-card"><div class="mini-label">ITEMZFLOW DUMP LOCATION</div><div class="detect-row"><div><strong>Check accessible locations</strong><small>Uses Dumper_Path only when Linux can access it</small></div><button class="button button-quiet" id="detect-dumps" ${current.discoveryBusy ? 'disabled' : ''}>${current.discoveryBusy ? 'Checking…' : 'Detect dumps'} <span>↗</span></button></div>${renderCandidates()}</div>
  </section>
  <details class="settings-panel"><summary>Optional Itemzflow settings.ini</summary><div class="settings-row"><input id="settings-path" value="${escapeHtml(settings.itemzflowSettings)}" placeholder="Select settings.ini to read Dumper_Path" autocomplete="off" spellcheck="false"/><button class="button button-secondary" id="browse-settings">Browse</button><button class="button button-quiet" id="save-settings">Save setting</button></div><small>Only accessible Linux paths are used. This setting helps dump discovery when Itemzflow’s configuration is mounted.</small></details>
  <div class="ready-bottom"><span><b>BASE GAME FIRST</b> · Patch and DLC support needs separate verification</span><button class="text-button" id="preview-ui">Preview screens <span>↗</span></button></div>`, false);
  bindReady();
}

function renderCandidates() {
  if (current.discoveryBusy) return '<div class="candidate-note">Checking accessible removable-media locations…</div>';
  if (!current.candidates.length) return '<div class="candidate-note">No accessible dumps detected yet. Browse for a folder.</div>';
  return `<div class="candidate-list">${current.candidates.slice(0, 3).map(candidate => `<button class="candidate" data-candidate="${escapeHtml(candidate.path)}"><span class="candidate-icon">◈</span><span><strong>${escapeHtml(candidate.title || candidate.titleId)}</strong><small>${escapeHtml(candidate.titleId)} · ${escapeHtml(basename(candidate.path))}</small></span><span class="candidate-arrow">→</span></button>`).join('')}</div>`;
}

function renderProcessing() {
  const progress = current.percent == null ? null : Math.max(0, Math.min(100, current.percent));
  const progressLabel = progress == null ? '<span class="calculating-chip">Working</span>' : progress >= 100 ? '<span class="stage-complete-label">Stage complete</span>' : `${Math.floor(progress)}<small>%</small>`;
  app.innerHTML = shell(`<section class="process-wrap">
    <div class="process-heading"><div class="eyebrow"><span class="pulse-dot"></span> ${current.demo ? 'DEMONSTRATION' : 'PACKAGE BUILD'}</div><h1>${current.demo ? 'Previewing progress' : 'Building fPKG'}</h1><p>${escapeHtml(current.title || current.titleId || basename(current.inputPath) || 'Preparing game dump')}</p></div>
    ${current.demo ? '<div class="demo-notice"><b>DEMO DATA</b> This progress is simulated for interface preview. No package is being built.</div>' : ''}
    <div class="progress-panel">
      <div class="progress-topline"><span class="mini-label">${progress == null ? 'STAGE PROGRESS' : 'MEASURED STAGE PROGRESS'}</span><span class="progress-percent">${progressLabel}</span></div>
      <div class="progress-track ${progress == null ? 'is-indeterminate' : ''}" role="progressbar" aria-label="Measured packaging stage progress" ${progress == null ? '' : `aria-valuenow="${Math.floor(progress)}" aria-valuemin="0" aria-valuemax="100"`}><div class="progress-fill" style="${progress == null ? '' : `width:${progress}%`}"></div></div>
      <div class="operation-row"><span class="operation-indicator"></span><span>${escapeHtml(current.stage)}</span><span class="stage-badge">${progress == null ? 'STAGE' : 'STAGE · MEASURED'}</span></div>
      <div class="metrics-grid"><div><span>PROCESSED IN STAGE</span><strong>${formatBytes(current.processed)}${current.total == null ? '' : ` <small>/ ${formatBytes(current.total)}</small>`}</strong></div><div><span>THROUGHPUT</span><strong>${formatRate(current.bytesPerSecond)}</strong></div><div><span>REMAINING</span><strong>${formatDuration(current.eta)}</strong></div></div>
      <div class="progress-footnote">Stage measurements reset when the packaging operation changes. Overall completion is shown only after package validation.</div>
    </div>
    <div class="processing-source"><span class="source-glyph">▤</span><div><strong>${escapeHtml(current.titleId || basename(current.inputPath))}</strong><small>${escapeHtml(current.inputPath)}</small></div><span class="processing-spinner"></span></div>
    ${current.demo ? '<div class="demo-controls"><button class="button button-secondary" id="demo-complete">Preview success</button><button class="button button-secondary" id="demo-error">Preview error</button><button class="text-button" id="exit-demo">Exit preview</button></div>' : ''}
  </section>`, current.demo);
  if (current.demo) bindDemoControls();
}

function renderComplete() {
  const title = current.title || current.titleId || 'Game package';
  const packageBytes = current.demo ? (current.packageBytes || 7_845_314_560) : current.packageBytes;
  const duration = current.demo ? (current.duration || 248) : current.duration;
  app.innerHTML = shell(`<section class="result-wrap">
    <div class="result-symbol success-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg><span></span></div>
    <div class="eyebrow centered"><span class="eyebrow-line"></span> VALIDATION COMPLETE <span class="eyebrow-line"></span></div>
    <h1>fPKG created<br><span>successfully.</span></h1>
    <p class="result-subtitle">${escapeHtml(title)}</p>
    ${current.demo ? '<div class="demo-notice"><b>DEMO DATA</b> This is a sample completion screen. No package was created.</div>' : ''}
    <div class="result-card"><div class="result-card-head"><span class="mini-label">PACKAGE DETAILS</span><span class="validation-pill"><i></i>${escapeHtml(current.validation || 'LibOrbisPkg checks passed')}</span></div><div class="result-file"><span class="pkg-icon">PKG</span><div><strong>${escapeHtml(basename(current.packagePath) || (current.demo ? 'CUSA12345_sample.pkg' : 'Package file'))}</strong><small>${escapeHtml(current.packagePath || current.outputFolder || '')}</small></div></div><div class="result-stats"><div><span>PACKAGE SIZE</span><strong>${packageBytes ? formatBytes(packageBytes) : '—'}</strong></div><div><span>BUILD TIME</span><strong>${Number.isFinite(duration) && duration >= 0 ? formatElapsed(duration) : '—'}</strong></div><div><span>STATUS</span><strong class="passed-text">Validated</strong></div></div></div>
    <button class="button button-primary continue-button" id="continue-button">Continue <span>→</span></button>
    <p class="completion-note">Your package is ready in the selected output folder. Continue does not install it.</p>
    ${current.demo ? '<button class="text-button exit-demo-bottom" id="exit-demo">Exit preview</button>' : ''}
  </section>`, current.demo);
  document.querySelector('#continue-button')?.addEventListener('click', resetReady);
  document.querySelectorAll('#exit-demo').forEach(el => el.addEventListener('click', () => { current = { ...current, screen: 'demo-menu', demo: true }; render(); }));
}

function renderError() {
  app.innerHTML = shell(`<section class="result-wrap error-wrap">
    <div class="result-symbol error-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5m0 4h.01M10.2 3.8 2.9 17a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3l-7.3-13.2a2 2 0 0 0-3.6 0Z"/></svg></div>
    <div class="eyebrow centered"><span class="eyebrow-line"></span> BUILD STOPPED <span class="eyebrow-line"></span></div>
    <h1>We couldn’t finish<br><span>this package.</span></h1>
    ${current.demo ? '<div class="demo-notice"><b>DEMO DATA</b> This sample error is for interface preview only.</div>' : ''}
    <div class="error-card"><div class="error-card-title"><span class="error-glyph">!</span><strong>${escapeHtml(current.error || 'The selected input could not be processed.')}</strong></div><details><summary>Diagnostic details</summary><pre>${escapeHtml(current.details || current.inputPath || 'No additional details.')}</pre></details></div>
    <div class="error-actions"><button class="button button-secondary" id="choose-another">Choose another game</button>${!current.demo && current.inputPath ? '<button class="button button-primary" id="retry-build">Retry</button>' : ''}</div>
    ${current.demo ? '<button class="text-button exit-demo-bottom" id="exit-demo">Exit preview</button>' : ''}
  </section>`, current.demo);
  document.querySelector('#choose-another')?.addEventListener('click', () => current.demo ? (current.screen = 'demo-menu', render()) : resetReady());
  document.querySelector('#retry-build')?.addEventListener('click', () => beginProcessing(current.inputPath));
  document.querySelectorAll('#exit-demo').forEach(el => el.addEventListener('click', () => { current = { ...current, screen: 'demo-menu', demo: true }; render(); }));
}

function renderDemoMenu() {
  app.innerHTML = shell(`<section class="demo-menu-wrap"><div class="eyebrow centered"><span class="eyebrow-line"></span> UI WALKTHROUGH <span class="eyebrow-line"></span></div><h1>Preview the<br><span>application states.</span></h1><div class="demo-notice"><b>DEMO MODE</b> Demonstration data only. These screens do not call the packaging engine.</div><div class="demo-option-grid"><button class="demo-option" data-demo="processing"><span>01</span><strong>Packaging progress</strong><small>Sample 67% stage progress, speed and ETA</small><b>Preview →</b></button><button class="demo-option" data-demo="complete"><span>02</span><strong>Successful completion</strong><small>Example package information after validation</small><b>Preview →</b></button><button class="demo-option" data-demo="error"><span>03</span><strong>Error and recovery</strong><small>Readable failure details and recovery actions</small><b>Preview →</b></button></div><button class="button button-secondary" id="back-ready">Back to packaging</button></section>`, true);
  document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
    current.demo = true;
    current.title = 'FPKG Builder Demo Game';
    current.titleId = 'CUSA12345';
    current.inputPath = '/demo/Itemzflow/CUSA12345';
    current.processed = 20_100_000_000;
    current.total = 30_000_000_000;
    current.percent = 67;
    current.bytesPerSecond = 78_000_000;
    current.eta = 175;
    current.stage = 'Writing package data · outer PFS';
    current.validation = 'Demo validation passed';
    current.packagePath = '/demo/output/fPKGs/CUSA12345_sample.pkg';
    current.packageBytes = 7_845_314_560;
    current.duration = 248;
    current.screen = button.dataset.demo === 'processing' ? 'demo-processing' : button.dataset.demo === 'complete' ? 'demo-complete' : 'demo-error';
    current.error = 'A source file referenced by the GP4 project could not be read.';
    current.details = 'Demo diagnostic: FileNotFoundException while resolving sce_sys/param.sfo. This is example text only.';
    render();
  }));
  document.querySelector('#back-ready')?.addEventListener('click', resetReady);
}

function bindReady() {
  document.querySelector('#browse-folder')?.addEventListener('click', async () => {
    try { const path = await open({ title: 'Select Itemzflow game dump', multiple: false, directory: true }); if (path) beginProcessing(String(path)); }
    catch (error) { showLocalError(error); }
  });
  document.querySelector('#browse-gp4')?.addEventListener('click', async () => {
    try { const path = await open({ title: 'Select GP4 project', multiple: false, directory: false, filters: [{ name: 'GP4 project', extensions: ['gp4'] }] }); if (path) beginProcessing(String(path)); }
    catch (error) { showLocalError(error); }
  });
  document.querySelector('#browse-output')?.addEventListener('click', async () => {
    try { const path = await open({ title: 'Choose package output folder', multiple: false, directory: true }); if (path) { current.outputFolder = String(path); saveSettings(); render(); } }
    catch (error) { showLocalError(error); }
  });
  document.querySelector('#path-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const path = document.querySelector('#input-path')?.value.trim();
    if (path) beginProcessing(path);
  });
  document.querySelector('#detect-dumps')?.addEventListener('click', detectDumps);
  document.querySelector('#browse-settings')?.addEventListener('click', async () => {
    try { const path = await open({ title: 'Select Itemzflow settings.ini', multiple: false, directory: false, filters: [{ name: 'INI settings', extensions: ['ini'] }] }); if (path) { settings.itemzflowSettings = String(path); saveSettings(); render(); } }
    catch (error) { showLocalError(error); }
  });
  document.querySelector('#save-settings')?.addEventListener('click', () => {
    settings.itemzflowSettings = document.querySelector('#settings-path')?.value.trim() || '';
    saveSettings();
    render();
  });
  document.querySelector('#preview-ui')?.addEventListener('click', () => { current.screen = 'demo-menu'; current.demo = true; render(); });
  document.querySelectorAll('[data-candidate]').forEach(button => button.addEventListener('click', () => beginProcessing(button.dataset.candidate)));
  attachDropListener();
}

async function attachDropListener() {
  try {
    await getCurrentWebview().onDragDropEvent(event => {
      if (current.screen !== 'ready') return;
      if (event.payload.type === 'over') { current.isDropTarget = true; document.querySelector('#dropzone')?.classList.add('dropzone-active'); }
      else if (event.payload.type === 'leave' || event.payload.type === 'cancel') { current.isDropTarget = false; document.querySelector('#dropzone')?.classList.remove('dropzone-active'); }
      else if (event.payload.type === 'drop') {
        current.isDropTarget = false;
        const path = event.payload.paths?.[0];
        if (path) beginProcessing(path);
      }
    });
  } catch { /* Browser preview has no native Tauri drag/drop API. */ }
}

async function detectDumps() {
  current.discoveryBusy = true;
  current.candidates = [];
  render();
  try { await invoke('discover_dumps', { settingsPath: settings.itemzflowSettings || null }); }
  catch (error) { current.error = String(error); current.details = current.error; current.screen = 'error'; }
  finally { current.discoveryBusy = false; render(); }
}

async function beginProcessing(path) {
  if (current.screen === 'processing') return;
  if (!current.outputFolder) {
    try { current.outputFolder = await invoke('get_default_output'); saveSettings(); }
    catch (error) { showLocalError(error); return; }
  }
  settings.lastInput = path;
  saveSettings();
  current = { ...current, screen: 'processing', demo: false, inputPath: path, title: '', titleId: '', stage: 'Inspecting selected input', percent: null, processed: 0, total: null, bytesPerSecond: null, eta: null, packagePath: '', packageBytes: 0, duration: 0, error: '', details: '' };
  render();
  try { await invoke('start_build', { inputPath: path, outputFolder: current.outputFolder }); }
  catch (error) {
    current.screen = 'error';
    current.error = readableError(error);
    current.details = String(error);
    render();
  }
}

function readableError(message) {
  const text = String(message || 'The package operation failed.');
  if (text.includes('not enough free space')) return 'There is not enough free space in the selected output location.';
  if (text.includes('does not exist') || text.includes('not a usable Itemzflow')) return 'The selected input is not an accessible game dump or GP4 project.';
  if (text.includes('referenced') || text.includes('Could not resolve')) return 'A file referenced by the GP4 project is missing or inaccessible.';
  if (text.includes('GP4')) return 'The GP4 project or its source files could not be validated.';
  return text;
}

function onBuilderEvent(event) {
  if (!event || current.demo) return;
  if (event.event === 'dump-candidate') {
    current.candidates.push(event);
    if (current.screen === 'ready') renderNextFrame();
    return;
  }
  if (event.event === 'input-accepted') {
    current.titleId = current.titleId || '';
    current.stage = event.inputType === 'gp4' ? 'Checking GP4 project and source files' : 'Inspecting game metadata and files';
  } else if (event.event === 'gp4-ready') {
    current.titleId = event.titleId || current.titleId;
    current.stage = event.mode === 'reused' ? 'Using existing Itemzflow GP4' : 'Preparing a GP4 for this dump';
  } else if (event.event === 'space-check') {
    current.stage = 'Output storage check passed';
  } else if (event.event === 'build-progress') {
    current.stage = eventText(event);
    current.processed = Number(event.bytesProcessed) || 0;
    current.total = Number.isFinite(event.bytesTotal) ? Number(event.bytesTotal) : null;
    current.percent = current.total && current.total > 0 ? current.processed / current.total * 100 : null;
    current.bytesPerSecond = Number.isFinite(event.bytesPerSecond) ? event.bytesPerSecond : null;
    current.eta = Number.isFinite(event.stageEtaSeconds) ? event.stageEtaSeconds : null;
  } else if (event.event === 'validation-started') {
    current.stage = 'Validating package hashes and signatures';
    current.processed = 0;
    current.percent = null;
    current.total = null;
    current.bytesPerSecond = null;
    current.eta = null;
  } else if (event.event === 'completed') {
    current.title = event.title || current.title;
    current.titleId = event.titleId || current.titleId;
    current.packagePath = event.packagePath || '';
    current.packageBytes = event.packageBytes || 0;
    current.outputFolder = event.outputFolder || current.outputFolder;
    current.validation = event.validation === 'passed' ? 'LibOrbisPkg validation passed' : 'Validation status unavailable';
    current.duration = event.buildDurationSeconds || 0;
    current.screen = 'complete';
  } else if (event.event === 'build-error') {
    current.screen = 'error';
    current.error = readableError(event.message);
    current.details = event.details || event.message || '';
  }
  renderNextFrame();
}

function showLocalError(error) {
  current.screen = 'error';
  current.demo = false;
  current.error = readableError(error);
  current.details = String(error);
  render();
}

function resetReady() {
  current = { ...current, screen: 'ready', demo: false, inputPath: '', title: '', titleId: '', stage: 'Waiting for a game dump', percent: null, processed: 0, total: null, bytesPerSecond: null, eta: null, packagePath: '', packageBytes: 0, duration: 0, error: '', details: '', candidates: [] };
  render();
}

function bindDemoControls() {
  document.querySelector('#demo-complete')?.addEventListener('click', () => { current.screen = 'demo-complete'; current.validation = 'Demonstration validation passed'; render(); });
  document.querySelector('#demo-error')?.addEventListener('click', () => { current.screen = 'demo-error'; current.error = 'A file referenced by the GP4 project could not be read.'; current.details = 'Demonstration error details. No game files were accessed.'; render(); });
  document.querySelector('#exit-demo')?.addEventListener('click', resetReady);
}

async function initialize() {
  try {
    const [core, events, webview, dialog] = await Promise.all([
      import('@tauri-apps/api/core'), import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webview'), import('@tauri-apps/plugin-dialog')
    ]);
    if (!core.isTauri()) throw new Error('Native Tauri runtime is not present');
    invoke = core.invoke;
    listen = events.listen;
    getCurrentWebview = webview.getCurrentWebview;
    open = dialog.open;
  } catch { /* Non-native development views have no native commands. */ }
  render();
  try {
    if (!listen) throw new Error('Browser preview');
    await listen('builder-event', event => onBuilderEvent(event.payload));
    await listen('builder-error', event => onBuilderEvent({ event: 'build-error', ...event.payload }));
  } catch { /* Native event listeners are unavailable outside Tauri. */ }
  if (!current.outputFolder) {
    try { current.outputFolder = await invoke('get_default_output'); saveSettings(); if (current.screen === 'ready') render(); }
    catch { /* A static browser preview uses a demonstration output path only inside demo states. */ }
  }
  if (invoke && current.screen === 'ready') void detectDumps();
}

initialize();
