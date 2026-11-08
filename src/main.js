import { formatDuration, formatElapsed } from './format.js';

const app = document.querySelector('#app');
let invoke = null;
let listen = null;
let getCurrentWebview = null;
let saveDialog = null;
let current = freshState();
let renderQueued = false;
let dropListenerAttached = false;

function freshState() {
  return {
    screen: 'ready', inputPath: '', title: '', titleId: '', stage: 'Waiting for Itemzflow folder',
    percent: null, processed: 0, total: null, bytesPerSecond: null, eta: null,
    packagePath: '', packageBytes: 0, duration: 0, validation: '', error: '', details: '',
    isDropTarget: false, stagingDirectory: '', completion: null
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function basename(path = '') { return path.split(/[\\/]/).filter(Boolean).at(-1) || path; }
function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatRate(value) { return Number.isFinite(value) && value > 0 ? `${formatBytes(value)}/s` : 'Calculating…'; }

function shell(content) {
  return `<div class="shell">
    <header class="topbar"><a class="brand" href="#" aria-label="FPKG Builder"><span class="brand-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 9 23 12v22L32 55 9 43V21L32 9Z"/><path d="M9 21l23 13 23-13M32 34v21M21 15l23 13"/></svg></span><span class="brand-copy"><strong>FPKG BUILDER</strong><small>ITEMZFLOW PACKAGING</small></span></a><div class="topbar-right"><span class="engine-status"><i></i> LibOrbisPkg engine</span></div></header>
    <main class="main-content">${content}</main><footer class="footer"><span>Itemzflow dump → one fPKG</span><span>Package validation does not guarantee PS4 installation</span></footer>
  </div>`;
}

function render() {
  if (current.screen === 'processing') renderProcessing();
  else if (current.screen === 'complete') renderComplete();
  else if (current.screen === 'error') renderError();
  else renderReady();
}
function renderNextFrame() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function renderReady() {
  app.innerHTML = shell(`<section class="welcome"><div class="eyebrow"><span class="eyebrow-line"></span> ITEMZFLOW TO FPKG</div><h1>Drop the folder.<br><span>We’ll handle the rest.</span></h1><p class="welcome-copy">Put the game folder and its matching -patch folder inside one folder named Itemzflow, then drop that whole folder here.</p></section>
    <section class="dropzone ${current.isDropTarget ? 'dropzone-active' : ''}" id="dropzone" aria-label="Drop the complete Itemzflow folder here"><div class="drop-orbit"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="drop-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></span></div><h2>${current.isDropTarget ? 'Release to start' : 'Drop the entire Itemzflow folder here'}</h2><p>Base game and matching update are combined into one .pkg</p><div class="drop-foot"><span><i class="tiny-check"></i> GP4 reused when available</span><span><i class="tiny-check"></i> Original files left in place</span></div></section>
    <div class="ready-bottom"><span>One Itemzflow folder · One combined package · Choose its save location after validation</span></div>`);
  attachDropListener();
}

function renderProcessing() {
  const progress = current.percent == null ? null : Math.max(0, Math.min(100, current.percent));
  const progressLabel = progress == null ? '<span class="calculating-chip">Working</span>' : `${Math.floor(progress)}<small>%</small>`;
  app.innerHTML = shell(`<section class="process-wrap"><div class="process-heading"><div class="eyebrow"><span class="pulse-dot"></span> PACKAGE BUILD</div><h1>Building one fPKG</h1><p>${escapeHtml(current.title || current.titleId || 'Inspecting Itemzflow folder')}</p></div>
    <div class="progress-panel"><div class="progress-topline"><span class="mini-label">${progress == null ? 'STAGE PROGRESS' : 'MEASURED STAGE PROGRESS'}</span><span class="progress-percent">${progressLabel}</span></div><div class="progress-track ${progress == null ? 'is-indeterminate' : ''}" role="progressbar" aria-label="Measured packaging stage progress" ${progress == null ? '' : `aria-valuenow="${Math.floor(progress)}" aria-valuemin="0" aria-valuemax="100"`}><div class="progress-fill" style="${progress == null ? '' : `width:${progress}%`}"></div></div>
    <div class="operation-row"><span class="operation-indicator"></span><span>${escapeHtml(current.stage)}</span><span class="stage-badge">${progress == null ? 'STAGE' : 'STAGE · MEASURED'}</span></div><div class="metrics-grid"><div><span>PROCESSED IN STAGE</span><strong>${formatBytes(current.processed)}${current.total == null ? '' : ` <small>/ ${formatBytes(current.total)}</small>`}</strong></div><div><span>THROUGHPUT</span><strong>${formatRate(current.bytesPerSecond)}</strong></div><div><span>REMAINING</span><strong>${formatDuration(current.eta)}</strong></div></div><div class="progress-footnote">Progress reflects measured packaging work. Remaining time is estimated.</div></div>
    <div class="processing-source"><span class="source-glyph">▤</span><div><strong>${escapeHtml(current.titleId || basename(current.inputPath))}</strong><small>${escapeHtml(current.inputPath)}</small></div><span class="processing-spinner"></span></div></section>`);
}

function renderComplete() {
  app.innerHTML = shell(`<section class="result-wrap"><div class="result-symbol success-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg><span></span></div><div class="eyebrow centered"><span class="eyebrow-line"></span> VALIDATION COMPLETE <span class="eyebrow-line"></span></div><h1>fPKG created<br><span>successfully.</span></h1><p class="result-subtitle">${escapeHtml(current.title || current.titleId)}</p>
    <div class="result-card"><div class="result-card-head"><span class="mini-label">ONE COMBINED PACKAGE</span><span class="validation-pill"><i></i>${escapeHtml(current.validation)}</span></div><div class="result-file"><span class="pkg-icon">PKG</span><div><strong>${escapeHtml(basename(current.packagePath))}</strong><small>${escapeHtml(current.packagePath)}</small></div></div><div class="result-stats"><div><span>PACKAGE SIZE</span><strong>${formatBytes(current.packageBytes)}</strong></div><div><span>BUILD TIME</span><strong>${formatElapsed(current.duration)}</strong></div><div><span>STATUS</span><strong class="passed-text">Validated</strong></div></div></div>
    <button class="button button-primary continue-button" id="continue-button">Continue <span>→</span></button><p class="completion-note">The package is saved at the location you selected. FPKG Builder does not install it.</p></section>`);
  document.querySelector('#continue-button')?.addEventListener('click', () => { current = freshState(); render(); });
}

function renderError() {
  app.innerHTML = shell(`<section class="result-wrap error-wrap"><div class="result-symbol error-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5m0 4h.01M10.2 3.8 2.9 17a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3l-7.3-13.2a2 2 0 0 0-3.6 0Z"/></svg></div><div class="eyebrow centered"><span class="eyebrow-line"></span> BUILD STOPPED <span class="eyebrow-line"></span></div><h1>We couldn’t finish<br><span>this package.</span></h1><div class="error-card"><div class="error-card-title"><span class="error-glyph">!</span><strong>${escapeHtml(current.error || 'The Itemzflow folder could not be processed.')}</strong></div><details><summary>Diagnostic details</summary><pre>${escapeHtml(current.details || current.inputPath || 'No additional details.')}</pre></details></div><div class="error-actions"><button class="button button-secondary" id="choose-another">Choose another folder</button>${current.stagingDirectory && current.completion ? '<button class="button button-primary" id="save-again">Choose save location</button>' : current.inputPath ? '<button class="button button-primary" id="retry-build">Retry</button>' : ''}</div></section>`);
  document.querySelector('#choose-another')?.addEventListener('click', async () => {
    if (current.stagingDirectory) { try { await invoke('discard_staged_package', { stagingDirectory: current.stagingDirectory }); } catch { /* Keep the visible error recoverable if cleanup fails. */ } }
    current = freshState(); render();
  });
  document.querySelector('#retry-build')?.addEventListener('click', () => beginProcessing(current.inputPath));
  document.querySelector('#save-again')?.addEventListener('click', () => saveCompletedPackage({ stagingDirectory: current.stagingDirectory, completion: current.completion }));
}

async function attachDropListener() {
  if (dropListenerAttached) return;
  try {
    await getCurrentWebview().onDragDropEvent(event => {
      if (current.screen !== 'ready') return;
      if (event.payload.type === 'over') { current.isDropTarget = true; document.querySelector('#dropzone')?.classList.add('dropzone-active'); }
      else if (event.payload.type === 'leave' || event.payload.type === 'cancel') { current.isDropTarget = false; document.querySelector('#dropzone')?.classList.remove('dropzone-active'); }
      else if (event.payload.type === 'drop') {
        current.isDropTarget = false;
        const path = event.payload.paths?.[0];
        if (path) void beginProcessing(path);
      }
    });
    dropListenerAttached = true;
  } catch { /* Native drag and drop is available only in the Tauri desktop app. */ }
}

async function beginProcessing(path) {
  if (current.screen === 'processing') return;
  current = { ...freshState(), screen: 'processing', inputPath: path, stage: 'Inspecting the Itemzflow folder' };
  render();
  try { await invoke('start_build', { inputPath: path }); }
  catch (error) { showError(error); }
}

function readableError(message) {
  const text = String(message || 'The package operation failed.');
  if (text.includes('No base-game folder')) return 'No base-game dump was found inside the Itemzflow folder.';
  if (text.includes('More than one base-game')) return 'The Itemzflow folder contains more than one game. Leave one game and its update inside, then try again.';
  if (text.includes('matching -patch')) return 'The Itemzflow folder must be named Itemzflow and contain the game folder and its matching -patch folder.';
  if (text.includes('not enough free space')) return 'There is not enough free storage to build the combined package.';
  if (text.includes('GP4') || text.includes('referenced')) return 'A GP4 project or one of its referenced game files could not be used.';
  return text;
}

function showError(error, details = String(error)) {
  current.screen = 'error'; current.error = readableError(error); current.details = details; render();
}

async function saveCompletedPackage(payload) {
  current.stagingDirectory = payload.stagingDirectory;
  current.completion = payload.completion;
  current.stage = 'Choose where to save the validated package';
  renderNextFrame();
  try {
    const completion = payload.completion;
    const filename = `${completion.contentId || completion.titleId || 'FPKG'}.pkg`;
    const destination = await saveDialog({ title: 'Save completed fPKG', defaultPath: filename, filters: [{ name: 'PS4 package', extensions: ['pkg'] }] });
    if (!destination) {
      await invoke('discard_staged_package', { stagingDirectory: payload.stagingDirectory });
      current = freshState(); render(); return;
    }
    await invoke('finalize_package', { stagedPath: completion.packagePath, destinationPath: destination, completion });
  } catch (error) {
    current.error = readableError(error); current.details = String(error); current.screen = 'error'; render();
  }
}

function onBuilderEvent(event) {
  if (!event) return;
  if (event.event === 'input-accepted') {
    current.titleId = event.titleId || current.titleId;
    current.title = event.title || current.title;
    current.stage = event.inputType === 'base-game-and-update' ? 'Base game and update found' : 'Base game found';
  } else if (event.event === 'gp4-ready') {
    current.titleId = event.titleId || current.titleId;
    current.stage = event.mode === 'reused' ? 'Reusing Itemzflow GP4' : 'Preparing GP4 from dump';
  } else if (event.event === 'update-merged') {
    current.stage = 'Combining base game and update into one package';
  } else if (event.event === 'space-check') {
    current.stage = 'Temporary storage check passed';
  } else if (event.event === 'build-progress') {
    current.stage = event.stage || 'Building package';
    current.processed = Number(event.bytesProcessed) || 0;
    current.total = Number.isFinite(event.bytesTotal) ? Number(event.bytesTotal) : null;
    current.percent = current.total > 0 ? current.processed / current.total * 100 : null;
    current.bytesPerSecond = Number.isFinite(event.bytesPerSecond) ? event.bytesPerSecond : null;
    current.eta = Number.isFinite(event.stageEtaSeconds) ? event.stageEtaSeconds : null;
  } else if (event.event === 'validation-started') {
    current.stage = 'Validating the completed package'; current.percent = null; current.processed = 0; current.total = null; current.bytesPerSecond = null; current.eta = null;
  } else if (event.event === 'completed') {
    current.title = event.title || current.title; current.titleId = event.titleId || current.titleId;
    current.packagePath = event.packagePath; current.packageBytes = Number(event.packageBytes) || 0;
    current.validation = 'LibOrbisPkg validation passed'; current.duration = Number(event.buildDurationSeconds) || 0;
    current.screen = 'complete';
  } else if (event.event === 'build-error') {
    showError(event.message, event.details || event.message || ''); return;
  }
  renderNextFrame();
}

async function initialize() {
  try {
    const [core, events, webview, dialog] = await Promise.all([
      import('@tauri-apps/api/core'), import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webview'), import('@tauri-apps/plugin-dialog')
    ]);
    if (!core.isTauri()) throw new Error('Tauri desktop runtime is not present');
    invoke = core.invoke; listen = events.listen; getCurrentWebview = webview.getCurrentWebview; saveDialog = dialog.save;
  } catch { /* Web-only preview cannot run production packaging operations. */ }
  render();
  if (listen) {
    await listen('builder-event', event => onBuilderEvent(event.payload));
    await listen('builder-error', event => onBuilderEvent({ event: 'build-error', ...event.payload }));
    await listen('builder-ready-to-save', event => { void saveCompletedPackage(event.payload); });
  }
}

initialize();
