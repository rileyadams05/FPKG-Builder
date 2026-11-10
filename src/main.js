import { formatDuration, formatElapsed } from './format.js';

const app = document.querySelector('#app');
let invoke = null;
let listen = null;
let getCurrentWebview = null;
let openDialog = null;
let current = freshState();
let dropListenerAttached = false;
let renderQueued = false;

function freshState() {
  return {
    screen: 'ready', inputPath: '', title: '', titleId: '', contentId: '', updateKind: '',
    stage: 'No Itemzflow folder selected', percent: null, processed: 0, total: null,
    bytesPerSecond: null, eta: null, packagePath: '', packageBytes: 0, duration: 0,
    validation: '', error: '', details: '', isDropTarget: false, inspection: null,
    waitingForUpdate: false, updateInstruction: false, logs: []
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function basename(path = '') { return path.split(/[\\/]/).filter(Boolean).at(-1) || path; }
function outputFolderFor(path = '') { return path.replace(/[\\/]Itemzflow$/i, `${path.includes('\\') ? '\\' : '/'}FPKG`); }
function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatRate(value) { return Number.isFinite(value) && value > 0 ? `${formatBytes(value)}/s` : 'Calculating…'; }

function shell(content) {
  return `<div class="window-frame">
    <header class="app-header"><div class="app-icon">PKG</div><div class="app-title"><strong>FPKG Builder</strong><small>Itemzflow packaging workspace</small></div><span class="engine-led"></span><span class="engine-name">LibOrbisPkg</span></header>
    <nav class="menu-bar" aria-label="Application menu">
      <div class="menu-item"><button data-menu-toggle="file" aria-haspopup="true" aria-expanded="false">File</button><div class="menu-popup" data-menu-popup="file" hidden><button data-command="open">Open Itemzflow… <span>Ctrl+O</span></button><button data-command="close">Close project</button><hr><button data-command="exit">Exit</button></div></div>
      <div class="menu-item"><button data-menu-toggle="tools" aria-haspopup="true" aria-expanded="false">Tools</button><div class="menu-popup" data-menu-popup="tools" hidden><button data-command="build" ${current.inspection && current.screen === 'ready' && !current.waitingForUpdate && !current.updateInstruction ? '' : 'disabled'}>Build package <span>Ctrl+Enter</span></button><button data-command="rescan" ${current.inputPath ? '' : 'disabled'}>Rescan Itemzflow folder</button></div></div>
      <div class="menu-item"><button data-menu-toggle="help" aria-haspopup="true" aria-expanded="false">Help</button><div class="menu-popup" data-menu-popup="help" hidden><button data-command="about">About FPKG Builder</button></div></div>
    </nav>
    <div class="toolbar"><button id="open-folder" class="tool-button">▣ &nbsp;Open Itemzflow…</button><button id="build-pkg" class="tool-button primary" ${current.inspection && current.screen === 'ready' && !current.waitingForUpdate && !current.updateInstruction ? '' : 'disabled'}>▶ &nbsp;Build PKG</button><span class="toolbar-separator"></span><span class="toolbar-hint">Drop the complete Itemzflow folder into this window</span></div>
    <main class="workspace">${content}</main>
    <footer class="status-bar"><span class="status-light ${current.screen === 'error' ? 'bad' : ''}"></span><span>${escapeHtml(current.stage)}</span><span class="status-spacer"></span><span>External storage required</span></footer>
  </div>`;
}

function render() {
  if (current.screen === 'processing') renderProcessing();
  else if (current.screen === 'complete') renderComplete();
  else if (current.screen === 'error') renderError();
  else renderReady();
  wireCommonControls();
}
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function renderReady() {
  const inspection = current.inspection;
  const detail = inspection ? `<section class="project-panel">
      <div class="panel-heading"><strong>Itemzflow project</strong><span class="pill">${inspection.hasUpdate ? 'BASE GAME + UPDATE' : 'BASE GAME'}</span></div>
      <div class="project-body">
        <aside class="project-tree"><div class="tree-caption">SOURCE FOLDER</div><div class="tree-row selected">▾ &nbsp;Itemzflow</div><div class="tree-row indent">▸ &nbsp;${escapeHtml(inspection.titleId)}</div>${inspection.updateKind === 'itemzflow-folder' ? `<div class="tree-row indent">▸ &nbsp;${escapeHtml(inspection.titleId)}-patch</div>` : ''}${inspection.updateKind === 'pkg' ? '<div class="tree-row indent">▧ &nbsp;Update.pkg</div>' : ''}</aside>
        <div class="metadata-area"><div class="metadata-title">${escapeHtml(inspection.title || inspection.titleId)}</div><table class="metadata-table"><tbody><tr><th>Title ID</th><td>${escapeHtml(inspection.titleId)}</td></tr><tr><th>Content ID</th><td>${escapeHtml(inspection.contentId)}</td></tr><tr><th>GP4 project</th><td>${inspection.hasGp4 ? 'Existing project will be reused when valid' : 'Generated in memory if missing'}</td></tr><tr><th>Update</th><td>${inspection.hasUpdate ? inspection.updateKind === 'pkg' ? 'Update.pkg (will be validated)' : 'Matching Itemzflow patch folder' : 'None detected'}</td></tr><tr><th>Output</th><td>${escapeHtml(outputFolderFor(current.inputPath))}</td></tr></tbody></table></div>
      </div>
      ${current.updateInstruction ? `<div class="update-instructions"><strong>Place the update in this Itemzflow folder, then rescan</strong><p>Use Itemzflow to create the matching <code>${escapeHtml(inspection.titleId)}-patch</code> folder, or copy a compatible update package here and name it <code>Update.pkg</code>. The update must match this game. The original files will be left in place.</p><button id="rescan-folder" class="tool-button">↻ &nbsp;Rescan Itemzflow folder</button></div>` : ''}
      ${current.waitingForUpdate ? `<div class="update-question"><strong>Do you have a game update?</strong><div><button id="update-yes" class="tool-button">Yes</button><button id="update-no" class="tool-button primary">No</button></div></div>` : ''}
    </section>` : `<section class="empty-project ${current.isDropTarget ? 'drag-active' : ''}" id="dropzone" tabindex="0" role="button" aria-label="Drop the Itemzflow folder or open a folder"><div class="empty-icon">▣</div><strong>${current.isDropTarget ? 'Release to inspect the folder' : 'Open or drop the Itemzflow folder'}</strong><span>Select the parent folder containing the game folder and optional matching update folder.</span><button id="browse-empty" class="tool-button">Browse for Itemzflow folder…</button></section>`;
  const notice = current.error ? `<div class="inline-error"><strong>${escapeHtml(current.error)}</strong><details><summary>Diagnostic details</summary><pre>${escapeHtml(current.details)}</pre></details><button id="dismiss-error" class="small-button">Dismiss</button></div>` : '';
  app.innerHTML = shell(`${notice}${detail}<section class="log-panel"><div class="panel-heading"><strong>Operation log</strong><button class="small-button" id="clear-log">Clear</button></div><div class="log-lines">${current.logs.length ? current.logs.map(line => `<div>${escapeHtml(line)}</div>`).join('') : '<div class="log-placeholder">Ready. Select or drop an Itemzflow folder to inspect its contents.</div>'}</div></section>`);
  void attachDropListener();
}

function renderProcessing() {
  const value = current.percent == null ? null : Math.max(0, Math.min(100, current.percent));
  app.innerHTML = shell(`<section class="build-view">
    <div class="build-title"><strong>${escapeHtml(current.title || current.titleId || 'Building package')}</strong><span>${escapeHtml(current.titleId)}</span></div>
    <div class="build-progress"><div class="progress-heading"><strong>${escapeHtml(current.stage)}</strong><span>${value == null ? 'Measuring…' : `${Math.floor(value)}% · measured stage progress`}</span></div><div class="progress-track ${value == null ? 'indeterminate' : ''}" role="progressbar" aria-label="Measured stage progress" ${value == null ? '' : `aria-valuenow="${Math.floor(value)}" aria-valuemin="0" aria-valuemax="100"`}><div class="progress-fill" style="${value == null ? '' : `width:${value}%`}"></div></div><div class="metrics"><div><small>Processed this stage</small><b>${formatBytes(current.processed)}${current.total == null ? '' : ` / ${formatBytes(current.total)}`}</b></div><div><small>Throughput</small><b>${formatRate(current.bytesPerSecond)}</b></div><div><small>Estimated remaining</small><b>${formatDuration(current.eta)}</b></div></div><div class="progress-note">Stage progress is measured; remaining time is an estimate.</div></div>
    <div class="build-log"><div class="panel-heading"><strong>Build messages</strong></div><div class="log-lines">${current.logs.slice(-100).map(line => `<div>${escapeHtml(line)}</div>`).join('') || '<div class="log-placeholder">Preparing package…</div>'}</div></div>
    <div class="build-source"><strong>Source:</strong> ${escapeHtml(current.inputPath)} <span>Output: sibling FPKG folder on the same external drive</span></div>
  </section>`);
}

function renderComplete() {
  app.innerHTML = shell(`<section class="result-panel success">
    <div class="result-heading"><span class="result-mark">✓</span><div><strong>Package created successfully</strong><small>LibOrbisPkg validation passed</small></div></div>
    <table class="metadata-table result-table"><tbody><tr><th>Title</th><td>${escapeHtml(current.title || current.titleId)}</td></tr><tr><th>Package</th><td>${escapeHtml(basename(current.packagePath))}</td></tr><tr><th>Saved to</th><td>${escapeHtml(current.packagePath)}</td></tr><tr><th>Size</th><td>${formatBytes(current.packageBytes)}</td></tr><tr><th>Build time</th><td>${formatElapsed(current.duration)}</td></tr><tr><th>Validation</th><td>${escapeHtml(current.validation)}</td></tr></tbody></table>
    <div class="result-actions"><button id="continue-button" class="tool-button primary">Continue</button><span>The package is in the external drive’s FPKG folder. Use your existing PS4 package installer to install it.</span></div>
  </section>`);
  document.querySelector('#continue-button')?.addEventListener('click', () => { const path = current.inputPath; current = freshState(); current.inputPath = ''; current.stage = 'Ready for another Itemzflow folder'; render(); void path; });
}

function renderError() {
  app.innerHTML = shell(`<section class="result-panel failure">
    <div class="result-heading"><span class="result-mark">!</span><div><strong>Package build failed</strong><small>${escapeHtml(current.error || 'The operation did not complete.')}</small></div></div>
    <div class="diagnostics"><strong>Details</strong><pre>${escapeHtml(current.details || 'No further diagnostic output was provided.')}</pre></div>
    <div class="result-actions"><button id="retry-build" class="tool-button primary">Retry</button><button id="choose-another" class="tool-button">Choose another folder</button></div>
  </section>`);
  document.querySelector('#retry-build')?.addEventListener('click', () => { if (current.inputPath) inspectFolder(current.inputPath, true); });
  document.querySelector('#choose-another')?.addEventListener('click', () => { current = freshState(); render(); });
}

function wireCommonControls() {
  document.querySelectorAll('[data-menu-toggle]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.menuToggle;
    const popup = document.querySelector(`[data-menu-popup="${name}"]`);
    const opening = popup?.hidden;
    document.querySelectorAll('.menu-popup').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('[data-menu-toggle]').forEach(menuButton => menuButton.setAttribute('aria-expanded', 'false'));
    if (popup && opening) { popup.hidden = false; button.setAttribute('aria-expanded', 'true'); }
  }));
  document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.command;
    document.querySelectorAll('.menu-popup').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('[data-menu-toggle]').forEach(menuButton => menuButton.setAttribute('aria-expanded', 'false'));
    if (action === 'open') void chooseFolder();
    else if (action === 'close') { current = freshState(); render(); }
    else if (action === 'build' && current.inspection && !current.waitingForUpdate && !current.updateInstruction) void beginProcessing(current.inputPath, 'auto');
    else if (action === 'rescan' && current.inputPath) void inspectFolder(current.inputPath, false);
    else if (action === 'about') window.alert('FPKG Builder\nA Linux packaging utility for Itemzflow game dumps.\n\nPackaging engine: LibOrbisPkg by maxton (LGPL-3.0).');
    else if (action === 'exit') void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close());
  }));
  document.querySelector('#open-folder')?.addEventListener('click', chooseFolder);
  document.querySelector('#browse-empty')?.addEventListener('click', chooseFolder);
  document.querySelector('#build-pkg')?.addEventListener('click', () => {
    if (!current.inspection) { void chooseFolder(); return; }
    if (current.waitingForUpdate || current.updateInstruction) return;
    void beginProcessing(current.inputPath, 'auto');
  });
  document.querySelector('#dismiss-error')?.addEventListener('click', () => { current.error = ''; current.details = ''; render(); });
  document.querySelector('#clear-log')?.addEventListener('click', () => { current.logs = []; render(); });
  document.querySelector('#update-yes')?.addEventListener('click', () => { current.waitingForUpdate = false; current.updateInstruction = true; current.stage = 'Waiting for matching update'; render(); });
  document.querySelector('#update-no')?.addEventListener('click', () => { current.waitingForUpdate = false; void beginProcessing(current.inputPath, 'no'); });
  document.querySelector('#rescan-folder')?.addEventListener('click', () => inspectFolder(current.inputPath, false));
}

async function chooseFolder() {
  if (!openDialog) return;
  try {
    const selected = await openDialog({ title: 'Open Itemzflow folder', directory: true, multiple: false });
    if (typeof selected === 'string') await inspectFolder(selected, false);
  } catch (error) { showError('The folder picker could not be opened.', String(error)); }
}

async function attachDropListener() {
  if (dropListenerAttached || !getCurrentWebview) return;
  try {
    await getCurrentWebview().onDragDropEvent(event => {
      if (event.payload.type === 'over') { current.isDropTarget = true; document.querySelector('#dropzone')?.classList.add('drag-active'); }
      else if (event.payload.type === 'leave' || event.payload.type === 'cancel') { current.isDropTarget = false; document.querySelector('#dropzone')?.classList.remove('drag-active'); }
      else if (event.payload.type === 'drop') {
        current.isDropTarget = false;
        const path = event.payload.paths?.[0];
        if (path) void inspectFolder(path, false);
      }
    });
    dropListenerAttached = true;
  } catch { /* Native file drops are available in the Tauri application. */ }
}

async function inspectFolder(path, retryBuild) {
  if (!invoke || current.screen === 'processing') return;
  current = { ...freshState(), screen: 'ready', inputPath: path, stage: 'Inspecting Itemzflow folder…' };
  current.logs.push(`Inspecting ${path}`);
  render();
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.menu-item')) return;
    document.querySelectorAll('.menu-popup').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('[data-menu-toggle]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  });
  try {
    const result = await invoke('inspect_itemzflow', { inputPath: path });
    current.inspection = result;
    current.title = result.title || result.titleId;
    current.titleId = result.titleId;
    current.contentId = result.contentId;
    current.updateKind = result.updateKind || '';
    current.stage = result.hasUpdate ? 'Matching update detected' : 'Base game detected';
    current.logs.push(result.hasUpdate ? `Detected ${result.updateKind === 'pkg' ? 'Update.pkg' : 'matching Itemzflow update folder'}.` : 'No matching update detected.');
    if (retryBuild || result.hasUpdate) { render(); void beginProcessing(path, 'auto'); return; }
    current.waitingForUpdate = true;
    render();
  } catch (error) {
    current.screen = 'ready'; current.error = String(error); current.details = String(error); current.stage = 'Folder inspection failed'; render();
  }
}

async function beginProcessing(path, updateChoice) {
  if (!invoke || current.screen === 'processing') return;
  current.screen = 'processing'; current.waitingForUpdate = false; current.updateInstruction = false;
  current.stage = 'Checking external storage'; current.percent = null; current.processed = 0; current.total = null; current.logs.push('Starting package build.'); render();
  try { await invoke('start_build', { inputPath: path, updateChoice }); }
  catch (error) { showError(error, String(error)); }
}

function showError(message, details = String(message)) {
  current.screen = 'error'; current.error = String(message || 'The operation failed.'); current.details = details;
  current.stage = 'Build stopped'; render();
}

function onBuilderEvent(event) {
  if (!event) return;
  if (event.event === 'input-accepted') {
    current.titleId = event.titleId || current.titleId; current.title = event.title || current.title;
    current.stage = event.inputType === 'base-game-and-update' ? 'Base game and matching update found' : 'Base game found';
  } else if (event.event === 'gp4-ready') {
    current.stage = event.mode === 'reused' ? 'Using existing Itemzflow GP4' : 'Preparing GP4 from dump';
  } else if (event.event === 'update-merged') current.stage = 'Combining base game and update';
  else if (event.event === 'space-check') current.stage = 'External storage check passed';
  else if (event.event === 'build-progress') {
    current.stage = event.stage || 'Building package';
    current.processed = Number(event.bytesProcessed) || 0;
    current.total = Number.isFinite(event.bytesTotal) ? Number(event.bytesTotal) : null;
    current.percent = current.total > 0 ? current.processed / current.total * 100 : null;
    current.bytesPerSecond = Number.isFinite(event.bytesPerSecond) ? event.bytesPerSecond : null;
    current.eta = Number.isFinite(event.stageEtaSeconds) ? event.stageEtaSeconds : null;
  } else if (event.event === 'validation-started') {
    current.stage = 'Validating completed package'; current.percent = null; current.processed = 0; current.total = null; current.bytesPerSecond = null; current.eta = null;
  } else if (event.event === 'engine-message') current.logs.push(event.message);
  else if (event.event === 'completed') {
    current.title = event.title || current.title; current.titleId = event.titleId || current.titleId;
    current.packagePath = event.packagePath; current.packageBytes = Number(event.packageBytes) || 0;
    current.validation = 'LibOrbisPkg validation passed'; current.duration = Number(event.buildDurationSeconds) || 0;
    current.screen = 'complete'; current.stage = 'Package validated';
  } else if (event.event === 'build-error') { showError(event.message, event.details || event.message); return; }
  scheduleRender();
}

async function initialize() {
  try {
    const [core, events, webview, dialog] = await Promise.all([
      import('@tauri-apps/api/core'), import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webview'), import('@tauri-apps/plugin-dialog')
    ]);
    if (!core.isTauri()) throw new Error('Tauri desktop runtime is not present');
    invoke = core.invoke; listen = events.listen; getCurrentWebview = webview.getCurrentWebview; openDialog = dialog.open;
  } catch { /* Browser preview cannot run native packaging operations. */ }
  render();
  if (listen) {
    await listen('builder-event', event => onBuilderEvent(event.payload));
    await listen('builder-error', event => onBuilderEvent({ event: 'build-error', ...event.payload }));
  }
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); void chooseFolder(); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && current.inspection && !current.waitingForUpdate) { event.preventDefault(); void beginProcessing(current.inputPath, 'auto'); }
  });
}

initialize();
