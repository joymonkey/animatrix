
// ==============================================================================
// Captive Portal Detection
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
    const isCaptive = ua.includes('captivenetworksupport') || ua.includes('wv') || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches === false && !ua.includes('safari') && ua.includes('iphone'));
    
    if (isCaptive) {
        const portalWarning = document.getElementById('captivePortalWarning');
        if (portalWarning) portalWarning.style.display = 'flex';
    }
});
// ==============================================================================
// DOM Elements
// ==============================================================================
const connPill = document.getElementById('connPill');
const connStatusText = document.getElementById('connStatusText');
const matrixType = document.getElementById('matrixType');
const matrixRes = document.getElementById('matrixRes');
const i2cAddr = document.getElementById('i2cAddr');
const freeHeap = document.getElementById('freeHeap');
const playStateBadge = document.getElementById('playStateBadge');
const animName = document.getElementById('animName');
const animFps = document.getElementById('animFps');
const animFrames = document.getElementById('animFrames');
const animLoop = document.getElementById('animLoop');
const animSelect = document.getElementById('animSelect');
const matrixSelect = document.getElementById('matrixSelect');
const saveIndicator = document.getElementById('saveIndicator');
const wifiIndicator = document.getElementById('wifiIndicator');
const statusMessage = document.getElementById('statusMessage');
const ssidPromptBanner = document.getElementById('ssidPromptBanner');
const quickSsidInput = document.getElementById('quickSsidInput');
const bottomSsidInput = document.getElementById('bottomSsidInput');
const rebootModal = document.getElementById('rebootModal');
const rebootMsg = document.getElementById('rebootMsg');

// Navigation Tabs & Views
const tabTerminal = document.getElementById('tabTerminal');
const tabSettings = document.getElementById('tabSettings');
const viewTerminal = document.getElementById('viewTerminal');
const viewSettings = document.getElementById('viewSettings');

let currentView = 'terminal';
let currentActiveMatrix = 'adafruit_16x9';
let currentActiveWidth = 16;
let currentActiveHeight = 9;
let allAnimations = [];
let filterByActiveResolution = true;
let isRebooting = false;

// ==============================================================================
// View Switching (Terminal vs. Settings & Diagnostics)
// ==============================================================================
function switchView(viewName) {
    if (viewName !== 'settings') viewName = 'terminal';
    currentView = viewName;

    const isSettings = (viewName === 'settings');

    if (viewTerminal) viewTerminal.style.display = isSettings ? 'none' : 'flex';
    if (viewSettings) viewSettings.style.display = isSettings ? 'flex' : 'none';

    if (tabTerminal) tabTerminal.classList.toggle('active', !isSettings);
    if (tabSettings) tabSettings.classList.toggle('active', isSettings);

    // Update URL hash without causing a page jump
    try {
        if (history.replaceState) {
            history.replaceState(null, '', isSettings ? '#settings' : '#terminal');
        } else {
            window.location.hash = isSettings ? '#settings' : '#terminal';
        }
    } catch (_) {}

    // When switching to settings, ensure the probe grid UI is refreshed
    if (isSettings && typeof updateProbeUI === 'function') {
        updateProbeUI();
    }
}

// ==============================================================================
// UI Feedback
// ==============================================================================
function setStatus(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? 'var(--red-glow)' : 'var(--cyan-glow)';
    setTimeout(() => {
        statusMessage.textContent = '';
    }, 4000);
}

// ==============================================================================
// Telemetry & Status Polling
// ==============================================================================
async function fetchStatus() {
    if (isRebooting) return;

    try {
        const resp = await fetch('/api/status');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Connection
        connPill.classList.add('connected');
        connStatusText.textContent = 'ONLINE';

        // Matrix Hardware Telemetry
        if (data.matrix) {
            const rawType = (data.matrix.type || '--').toLowerCase();
            const prevWidth = currentActiveWidth;
            const prevHeight = currentActiveHeight;
            currentActiveMatrix = rawType;
            currentActiveWidth = data.matrix.width || ((rawType === 'custom_40x3' || rawType === 'custom_3x40') ? 40 : 16);
            currentActiveHeight = data.matrix.height || ((rawType === 'custom_40x3' || rawType === 'custom_3x40') ? 3 : 9);

            matrixType.textContent = (rawType === 'custom_40x3' || rawType === 'custom_3x40') ? '40x3 VISOR' : '16x9 ADA';
            matrixRes.textContent = `${currentActiveWidth} x ${currentActiveHeight}`;
            i2cAddr.textContent = data.matrix.found ? `0x${(data.matrix.i2c_addr || 0).toString(16).toUpperCase()}` : 'N/A';

            // Re-render dropdown and probe grid if hardware dimensions changed
            if (prevWidth !== currentActiveWidth || prevHeight !== currentActiveHeight) {
                renderAnimationDropdown();
                initProbeGrid();
            }

            // Keep bottom selector in sync if not actively focused
            if (matrixSelect && document.activeElement !== matrixSelect) {
                if (rawType === 'custom_40x3' || rawType === 'custom_3x40') {
                    matrixSelect.value = 'custom_40x3';
                } else if (rawType === 'adafruit_16x9') {
                    matrixSelect.value = 'adafruit_16x9';
                }
            }
        }

        // Wi-Fi Telemetry & Default SSID Prompt
        if (data.wifi) {
            const currentSsid = data.wifi.ssid || 'Animatrix-Visor';
            if (bottomSsidInput && document.activeElement !== bottomSsidInput) {
                bottomSsidInput.value = currentSsid;
            }

            const dismissed = sessionStorage.getItem('dismiss_ssid_prompt');
            if (data.wifi.is_default && !dismissed) {
                ssidPromptBanner.style.display = 'block';
                if (quickSsidInput && !quickSsidInput.value) {
                    quickSsidInput.value = currentSsid;
                }
            } else {
                ssidPromptBanner.style.display = 'none';
            }
        }

        // System
        if (data.system) {
            freeHeap.textContent = `${Math.round((data.system.free_heap || 0) / 1024)} KB`;
        }

        // Animation Telemetry
        if (data.animation) {
            const anim = data.animation;
            animName.textContent = (anim.name || 'NONE').toUpperCase();
            animFps.textContent = anim.fps ? `${anim.fps} FPS` : '--';
            animFrames.textContent = anim.total_frames ? `${anim.total_frames} FRAMES` : '--';
            animLoop.textContent = (anim.loop || '--').toUpperCase();

            if (anim.playing) {
                playStateBadge.textContent = 'PLAYING';
                playStateBadge.className = 'play-state-indicator active';
            } else if (anim.loaded) {
                playStateBadge.textContent = 'PAUSED';
                playStateBadge.className = 'play-state-indicator paused';
            } else {
                playStateBadge.textContent = 'IDLE';
                playStateBadge.className = 'play-state-indicator';
            }
        }
    } catch (err) {
        if (!isRebooting) {
            connPill.classList.remove('connected');
            connStatusText.textContent = 'OFFLINE';
        }
    }
}

// ==============================================================================
// SSID Customization
// ==============================================================================
function dismissSsidPrompt() {
    sessionStorage.setItem('dismiss_ssid_prompt', '1');
    ssidPromptBanner.style.display = 'none';
}

async function submitSsidChange(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const newSsid = input.value.trim();
    if (newSsid.length === 0 || newSsid.length > 32) {
        alert('SSID must be between 1 and 32 characters.');
        return;
    }

    if (wifiIndicator) {
        wifiIndicator.textContent = 'SAVING...';
        wifiIndicator.className = 'save-indicator saving';
    }

    try {
        const params = new URLSearchParams();
        params.append('ssid', newSsid);

        const resp = await fetch('/api/ssid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (resp.ok) {
            isRebooting = true;
            if (ssidPromptBanner) ssidPromptBanner.style.display = 'none';
            if (rebootMsg) {
                rebootMsg.innerHTML = `SSID changed to <strong>${newSsid}</strong>.<br><br>The ESP32-S3 is restarting. Please reconnect your phone to <strong>${newSsid}</strong> in a few moments.`;
            }
            if (rebootModal) {
                rebootModal.classList.add('visible');
            }
        } else {
            const err = await resp.json();
            alert('Failed to update SSID: ' + (err.message || resp.statusText));
            if (wifiIndicator) wifiIndicator.className = 'save-indicator';
        }
    } catch (err) {
        alert('Network error updating SSID: ' + err.message);
        if (wifiIndicator) wifiIndicator.className = 'save-indicator';
    }
}

// ==============================================================================
// Animation Sequences List & Resolution Filtering
// ==============================================================================
async function fetchAnimationList() {
    if (isRebooting) return;

    try {
        const resp = await fetch('/api/animations');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        allAnimations = data.files || [];
        renderAnimationDropdown();
    } catch (err) {
        console.warn('Could not fetch animations list:', err);
    }
}

function toggleMatrixFilter() {
    filterByActiveResolution = !filterByActiveResolution;
    renderAnimationDropdown();
}

function renderAnimationDropdown() {
    const filterBtn = document.getElementById('filterToggleBtn');
    const currentVal = animSelect.value;
    animSelect.innerHTML = '';

    const resLabel = `${currentActiveWidth}x${currentActiveHeight}`;
    if (filterBtn) {
        if (filterByActiveResolution) {
            filterBtn.textContent = `${resLabel} ONLY`;
            filterBtn.className = 'btn-filter-toggle';
            filterBtn.title = `Currently showing only animations for ${resLabel}. Click to show all files.`;
        } else {
            filterBtn.textContent = 'ALL FILES';
            filterBtn.className = 'btn-filter-toggle all-mode';
            filterBtn.title = `Currently showing all files. Click to filter by ${resLabel}.`;
        }
    }

    if (!allAnimations || allAnimations.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'NO ANIMATIONS ON BOARD';
        animSelect.appendChild(opt);
        return;
    }

    // Filter files by active matrix resolution
    const matchingFiles = filterByActiveResolution
        ? allAnimations.filter(f => f.width === currentActiveWidth && f.height === currentActiveHeight)
        : allAnimations;

    if (matchingFiles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = `NO ${resLabel} SEQUENCES (CLICK TOGGLE TO SHOW ALL)`;
        animSelect.appendChild(opt);
        return;
    }

    matchingFiles.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.name;
        const sizeKb = (f.size / 1024).toFixed(1);
        const rawTitle = f.title || f.name.replace('.json', '');
        const displayName = rawTitle.replace(/_/g, ' ').toUpperCase();
        const dimStr = (f.width && f.height) ? ` [${f.width}x${f.height}]` : '';
        opt.textContent = `${displayName}${dimStr} (${sizeKb} KB)`;
        animSelect.appendChild(opt);
    });

    if (currentVal && [...animSelect.options].some(o => o.value === currentVal)) {
        animSelect.value = currentVal;
    }
}

function onAnimationSelected(filename) {
    if (!filename) return;
    triggerAction('play', filename);
}

// ==============================================================================
// Hardware Actions
// ==============================================================================
async function triggerAction(action, file = null) {
    if (isRebooting) return;

    try {
        const params = new URLSearchParams();
        params.append('action', action);

        if (action === 'play') {
            const targetFile = file || animSelect.value;
            if (targetFile) {
                params.append('file', targetFile);
            }
        }

        const resp = await fetch('/api/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (resp.ok) {
            setStatus(`Triggered: ${action.toUpperCase()}`);
            fetchStatus();
        } else {
            setStatus(`Action failed: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Network error: ${err.message}`, true);
    }
}

// ==============================================================================
// Matrix Hardware Selection
// ==============================================================================
function scrollToHardware() {
    switchView('settings');
    setTimeout(() => {
        const sec = document.getElementById('hardwareSection');
        if (sec) {
            sec.scrollIntoView({ behavior: 'smooth' });
            sec.classList.add('highlight-section');
            setTimeout(() => sec.classList.remove('highlight-section'), 1500);
        }
    }, 60);
}

async function selectMatrixHardware(newType) {
    if (saveIndicator) {
        saveIndicator.textContent = 'SAVING...';
        saveIndicator.className = 'save-indicator saving';
    }

    try {
        setStatus(`Setting hardware to ${newType}...`);
        const params = new URLSearchParams();
        params.append('type', newType);

        const resp = await fetch('/api/matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (resp.ok) {
            currentActiveMatrix = newType;
            if (newType === 'custom_40x3' || newType === 'custom_3x40') {
                currentActiveWidth = 40;
                currentActiveHeight = 3;
            } else {
                currentActiveWidth = 16;
                currentActiveHeight = 9;
            }
            renderAnimationDropdown();

            if (saveIndicator) {
                saveIndicator.textContent = 'PERSISTED';
                saveIndicator.className = 'save-indicator saved';
                setTimeout(() => {
                    if (saveIndicator) saveIndicator.className = 'save-indicator';
                }, 2500);
            }
            setStatus(`Hardware set to ${newType === 'custom_40x3' ? '40x3 VISOR' : '16x9 ADA'}`);
            setTimeout(fetchStatus, 350);
        } else {
            setStatus('Failed to change matrix target', true);
            if (saveIndicator) {
                saveIndicator.textContent = 'FAILED';
                saveIndicator.className = 'save-indicator saving';
            }
        }
    } catch (err) {
        setStatus(`Error: ${err.message}`, true);
        if (saveIndicator) {
            saveIndicator.textContent = 'OFFLINE';
            saveIndicator.className = 'save-indicator saving';
        }
    }
}

// ==============================================================================
// Animation Upload
// ==============================================================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');


['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
});

dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileUpload(fileInput.files[0]);
});

async function handleFileUpload(file) {
    if (!file.name.endsWith('.json')) {
        setStatus('Please select a valid .json sequence file', true);
        return;
    }

    setStatus(`Uploading ${file.name}...`);

    try {
        const text = await file.text();
        let uploadDim = null;
        try {
            const parsed = JSON.parse(text);
            if (parsed.matrix && parsed.matrix.width && parsed.matrix.height) {
                uploadDim = { width: parsed.matrix.width, height: parsed.matrix.height };
            }
        } catch (_) {}

        const resp = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Animation-Name': file.name
            },
            body: text
        });

        if (resp.ok) {
            if (uploadDim && (uploadDim.width !== currentActiveWidth || uploadDim.height !== currentActiveHeight)) {
                setStatus(`Uploaded ${file.name} (${uploadDim.width}x${uploadDim.height}), but active matrix is ${currentActiveWidth}x${currentActiveHeight}! Switch hardware target or click toggle to view.`);
            } else {
                setStatus(`Loaded & playing ${file.name}!`);
            }
            await fetchAnimationList();
fetchPlaylists();
            if (animSelect.querySelector(`option[value="${file.name}"]`)) {
                animSelect.value = file.name;
            }
            setTimeout(fetchStatus, 400);
        } else {
            setStatus(`Upload failed: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Upload error: ${err.message}`, true);
    }
}

// ==============================================================================
// Single LED Probe & Hardware Debugger
// ==============================================================================
const probeStatusBadge = document.getElementById('probeStatusBadge');
const probeDiodeVal = document.getElementById('probeDiodeVal');
const probeCoordVal = document.getElementById('probeCoordVal');
const probeNetVal = document.getElementById('probeNetVal');
const probeHintVal = document.getElementById('probeHintVal');
const probeSlider = document.getElementById('probeSlider');
const probeIndexDisplay = document.getElementById('probeIndexDisplay');
const probeMaxDisplay = document.getElementById('probeMaxDisplay');
const probeMatrixGrid = document.getElementById('probeMatrixGrid');
const gridHoverInfo = document.getElementById('gridHoverInfo');

let activeProbeIndex = 0; // 0-based
let isProbeActive = false;

const PROBE_NETS_40X3 = [
    ["CA9","CA8",1,28],["CA9","CA7",1,27],["CA9","CA4",1,24],
    ["CA6","CA8",26,28],["CA6","CA7",26,27],["CA6","CA4",26,24],
    ["CA3","CA8",23,28],["CA3","CA7",23,27],["CA3","CA4",23,24],
    ["CA8","CA9",28,1],["CA7","CA9",27,1],["CA4","CA9",24,1],
    ["CA8","CA6",28,26],["CA7","CA6",27,26],["CA4","CA6",24,26],
    ["CA8","CA3",28,23],["CA7","CA3",27,23],["CA4","CA3",24,23],
    ["CA2","CA8",22,28],["CA2","CA7",22,27],["CA2","CA4",22,24],
    ["CA1","CA8",21,28],["CA1","CA7",21,27],["CA1","CA4",21,24],
    ["CA5","CA8",25,28],["CA5","CA7",25,27],["CA5","CA4",25,24],
    ["CA8","CA2",28,22],["CA7","CA2",27,22],["CA4","CA2",24,22],
    ["CA8","CA1",28,21],["CA7","CA1",27,21],["CA4","CA1",24,21],
    ["CA8","CA5",28,25],["CA7","CA5",27,25],["CA4","CA5",24,25],
    ["CA2","CA9",22,1],["CA2","CA6",22,26],["CA2","CA3",22,23],
    ["CA1","CA9",21,1],["CA1","CA6",21,26],["CA1","CA3",21,23],
    ["CA5","CA9",25,1],["CA5","CA6",25,26],["CA5","CA3",25,23],
    ["CA9","CA2",1,22],["CA6","CA2",26,22],["CA3","CA2",23,22],
    ["CA9","CA1",1,21],["CA6","CA1",26,21],["CA3","CA1",23,21],
    ["CA9","CA5",1,25],["CA6","CA5",26,25],["CA3","CA5",23,25],
    ["CA8","CA7",28,27],["CA8","CA4",28,24],["CA7","CA4",27,24],
    ["CA7","CA8",27,28],["CA4","CA8",24,28],["CA4","CA7",24,27],
    ["CB3","CB4",9,10],["CB3","CB5",9,11],["CB3","CB7",9,13],
    ["CB9","CB4",15,10],["CB9","CB5",15,11],["CB9","CB7",15,13],
    ["CB6","CB4",12,10],["CB6","CB5",12,11],["CB6","CB7",12,13],
    ["CB4","CB3",10,9],["CB5","CB3",11,9],["CB7","CB3",13,9],
    ["CB4","CB9",10,15],["CB5","CB9",11,15],["CB7","CB9",13,15],
    ["CB4","CB6",10,12],["CB5","CB6",11,12],["CB7","CB6",13,12],
    ["CB8","CB4",14,10],["CB8","CB5",14,11],["CB8","CB7",14,13],
    ["CB1","CB4",7,10],["CB1","CB5",7,11],["CB1","CB7",7,13],
    ["CB2","CB4",8,10],["CB2","CB5",8,11],["CB2","CB7",8,13],
    ["CB4","CB8",10,14],["CB5","CB8",11,14],["CB7","CB8",13,14],
    ["CB4","CB1",10,7],["CB5","CB1",11,7],["CB7","CB1",13,7],
    ["CB4","CB2",10,8],["CB5","CB2",11,8],["CB7","CB2",13,8],
    ["CB8","CB3",14,9],["CB8","CB9",14,15],["CB8","CB6",14,12],
    ["CB1","CB3",7,9],["CB1","CB9",7,15],["CB1","CB6",7,12],
    ["CB2","CB3",8,9],["CB2","CB9",8,15],["CB2","CB6",8,12],
    ["CB3","CB8",9,14],["CB9","CB8",15,14],["CB6","CB8",12,14],
    ["CB3","CB1",9,7],["CB9","CB1",15,7],["CB6","CB1",12,7],
    ["CB3","CB2",9,8],["CB9","CB2",15,8],["CB6","CB2",12,8],
    ["CB4","CB5",10,11],["CB4","CB7",10,13],["CB5","CB7",11,13],
    ["CB5","CB4",11,10],["CB7","CB4",13,10],["CB7","CB5",13,11]
];

function getMaxProbeLeds() {
    return currentActiveWidth * currentActiveHeight;
}

function initProbeGrid() {
    if (!probeMatrixGrid) return;
    probeMatrixGrid.innerHTML = '';

    const cols = currentActiveWidth;
    const rows = currentActiveHeight;
    probeMatrixGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    probeMatrixGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    const total = cols * rows;
    if (probeSlider) {
        probeSlider.max = total;
        if (probeMaxDisplay) probeMaxDisplay.textContent = total;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'probe-pixel-cell';
            const idx = (cols === 40 && rows === 3) ? (c * 3 + r) : (r * cols + c);
            cell.dataset.index = idx;
            cell.dataset.col = c;
            cell.dataset.row = r;

            cell.addEventListener('click', () => {
                setProbeIndex(idx);
            });

            cell.addEventListener('mouseenter', () => {
                if (gridHoverInfo) {
                    if (cols === 40 && rows === 3) {
                        gridHoverInfo.textContent = `D${idx + 1} (Col ${c + 1}, Row ${r + 1})`;
                    } else {
                        gridHoverInfo.textContent = `(${c}, ${r})`;
                    }
                }
            });

            cell.addEventListener('mouseleave', () => {
                if (gridHoverInfo) gridHoverInfo.textContent = '';
            });

            probeMatrixGrid.appendChild(cell);
        }
    }
    updateProbeUI();
}

function updateProbeUI() {
    const total = getMaxProbeLeds();
    if (activeProbeIndex >= total) activeProbeIndex = total - 1;
    if (activeProbeIndex < 0) activeProbeIndex = 0;

    if (probeSlider) probeSlider.value = activeProbeIndex + 1;
    if (probeIndexDisplay) probeIndexDisplay.textContent = isProbeActive ? (activeProbeIndex + 1) : '--';
    if (probeStatusBadge) {
        probeStatusBadge.textContent = isProbeActive ? 'ACTIVE (PROBING)' : 'OFF';
        probeStatusBadge.style.color = isProbeActive ? 'var(--cyan-glow)' : 'var(--text-muted)';
        probeStatusBadge.style.borderColor = isProbeActive ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.2)';
    }

    let col = 0, row = 0;
    if (currentActiveWidth === 40 && currentActiveHeight === 3) {
        col = Math.floor(activeProbeIndex / 3);
        row = activeProbeIndex % 3;
        const rowName = row === 0 ? 'Top' : (row === 1 ? 'Mid' : 'Bottom');

        if (probeDiodeVal) probeDiodeVal.textContent = isProbeActive ? `D${activeProbeIndex + 1}` : '--';
        if (probeCoordVal) probeCoordVal.textContent = isProbeActive ? `Col ${col + 1}, Row ${row + 1} (${rowName})` : 'None';

        const netInfo = PROBE_NETS_40X3[activeProbeIndex];
        if (netInfo && isProbeActive) {
            const [anode, cathode, aPin, cPin] = netInfo;
            if (probeNetVal) probeNetVal.textContent = `Anode: ${anode} (Pin ${aPin}) ➔ Cathode: ${cathode} (Pin ${cPin})`;
            const block = col < 20 ? 'Matrix A (Cols 1–20)' : 'Matrix B (Cols 21–40)';
            if (probeHintVal) {
                probeHintVal.innerHTML = `<strong>${block}</strong> • If another LED glows unexpectedly, check for solder bridges on <strong>${anode} (Pin ${aPin})</strong> or <strong>${cathode} (Pin ${cPin})</strong>.`;
            }
        } else if (!isProbeActive) {
            if (probeNetVal) probeNetVal.textContent = 'All LEDs Off';
            if (probeHintVal) probeHintVal.textContent = 'Use arrow keys (↑ / ↓) or tap any cell above to probe.';
        }
    } else {
        col = activeProbeIndex % currentActiveWidth;
        row = Math.floor(activeProbeIndex / currentActiveWidth);
        if (probeDiodeVal) probeDiodeVal.textContent = isProbeActive ? `P#${activeProbeIndex + 1}` : '--';
        if (probeCoordVal) probeCoordVal.textContent = isProbeActive ? `X=${col}, Y=${row}` : 'None';
        if (probeNetVal) probeNetVal.textContent = isProbeActive ? `Pixel (${col}, ${row}) on ${currentActiveWidth}x${currentActiveHeight}` : 'All LEDs Off';
    }

    // Highlight cell in grid
    if (probeMatrixGrid) {
        const cells = probeMatrixGrid.querySelectorAll('.probe-pixel-cell');
        cells.forEach(c => {
            const cIdx = parseInt(c.dataset.index);
            if (isProbeActive && cIdx === activeProbeIndex) {
                c.classList.add('active-probe');
            } else {
                c.classList.remove('active-probe');
            }
        });
    }
}

async function sendProbeCommand(x, y, brightness = 255) {
    try {
        const params = new URLSearchParams();
        params.append('x', x);
        params.append('y', y);
        params.append('brightness', brightness);

        await fetch('/api/pixel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
    } catch (err) {
        console.warn('Pixel probe error:', err);
    }
}

function setProbeIndex(idx) {
    const total = getMaxProbeLeds();
    if (idx < 0) idx = 0;
    if (idx >= total) idx = total - 1;

    activeProbeIndex = idx;
    isProbeActive = true;

    let x = 0, y = 0;
    if (currentActiveWidth === 40 && currentActiveHeight === 3) {
        x = Math.floor(idx / 3);
        y = idx % 3;
    } else {
        x = idx % currentActiveWidth;
        y = Math.floor(idx / currentActiveWidth);
    }

    updateProbeUI();
    sendProbeCommand(x, y, 255);
}

function stepProbe(delta) {
    const total = getMaxProbeLeds();
    let nextIdx = isProbeActive ? (activeProbeIndex + delta) : 0;
    if (nextIdx < 0) nextIdx = total - 1;
    if (nextIdx >= total) nextIdx = 0;
    setProbeIndex(nextIdx);
}

function onProbeSliderChange(val) {
    setProbeIndex(parseInt(val) - 1);
}

function probeAllOff() {
    isProbeActive = false;
    updateProbeUI();
    sendProbeCommand(-1, -1, 0);
}

// Global Keyboard Navigation (Enabled when viewing Settings / Diagnostics)
window.addEventListener('keydown', (e) => {
    // Ignore keystrokes inside text/select inputs
    const activeEl = document.activeElement;
    if (activeEl && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl.tagName)) {
        return;
    }

    // Only respond to probe arrow keys if we are on the Settings & Diagnostics page
    if (currentView !== 'settings') {
        return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        stepProbe(1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepProbe(-1);
    } else if (e.key === 'Escape' || e.key === ' ' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        probeAllOff();
    }
});

// ==============================================================================
// Initialization
// ==============================================================================
// Check URL hash or direct path for initial view selection
if (window.location.hash === '#settings' || window.location.pathname.includes('/settings')) {
    switchView('settings');
} else {
    switchView('terminal');
}

window.addEventListener('hashchange', () => {
    if (window.location.hash === '#settings') {
        switchView('settings');
    } else {
        switchView('terminal');
    }
});

fetchStatus();
fetchAnimationList();
fetchPlaylists();
setInterval(fetchStatus, 1500);
initProbeGrid();



// ==============================================================================
// OTA Firmware Update
// ==============================================================================
const otaDropZone = document.getElementById('otaDropZone');
const otaFileInput = document.getElementById('otaFileInput');
const otaStatusMsg = document.getElementById('otaStatusMsg');

if (otaDropZone && otaFileInput) {

    ['dragenter', 'dragover'].forEach(eventName => {
        otaDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            otaDropZone.style.background = 'rgba(0, 240, 255, 0.15)';
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        otaDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            otaDropZone.style.background = 'rgba(0, 240, 255, 0.05)';
        });
    });

    otaDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        otaDropZone.style.background = 'rgba(0, 240, 255, 0.05)';
        if (e.dataTransfer.files.length > 0) handleOtaUpload(e.dataTransfer.files[0]);
    });

    otaFileInput.addEventListener('change', () => {
        if (otaFileInput.files.length > 0) handleOtaUpload(otaFileInput.files[0]);
    });
}

async function handleOtaUpload(file) {
    if (!file.name.endsWith('.bin')) {
        if (otaStatusMsg) {
            otaStatusMsg.textContent = 'Please select a valid .bin firmware file';
            otaStatusMsg.style.color = 'var(--red-glow)';
        }
        return;
    }

    if (otaStatusMsg) {
        otaStatusMsg.textContent = `Uploading ${file.name}... Please wait, do not turn off.`;
        otaStatusMsg.style.color = 'var(--cyan-glow)';
    }

    try {
        const formData = new FormData();
        formData.append('update', file, file.name);

        const resp = await fetch('/api/update', {
            method: 'POST',
            body: formData
        });

        if (resp.ok) {
            isRebooting = true;
            if (rebootMsg) {
                rebootMsg.innerHTML = `Firmware flashed successfully.<br><br>The ESP32-S3 is restarting. Please wait 10 seconds and refresh the page.`;
            }
            if (rebootModal) {
                rebootModal.classList.add('visible');
            }
        } else {
            if (otaStatusMsg) {
                otaStatusMsg.textContent = `OTA Failed: ${resp.status}`;
                otaStatusMsg.style.color = 'var(--red-glow)';
            }
        }
    } catch (err) {
        if (otaStatusMsg) {
            otaStatusMsg.textContent = `Upload error: ${err.message}`;
            otaStatusMsg.style.color = 'var(--red-glow)';
        }
    }
}

// ==============================================================================
// Animation Download
// ==============================================================================
function downloadCurrentAnimation() {
    const filename = animSelect.value;
    if (!filename) {
        setStatus('No animation selected to download', true);
        return;
    }
    
    // Create an invisible anchor to trigger the download
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = `/api/download?file=${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
    }, 100);
}

function forceNativeBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) {
        // Use Android Intent to force open Chrome
        window.location.href = "intent://192.168.4.1#Intent;scheme=http;package=com.android.chrome;end";
    } else {
        // On iOS, trying to open a new tab sometimes forces Safari to take over.
        // If this fails, they still have the manual instructions on screen.
        const a = document.createElement('a');
        a.href = "http://192.168.4.1";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
    }
}

// ==============================================================================
// Startup Mode Selection
// ==============================================================================
async function selectStartupMode(mode) {
    try {
        const formData = new FormData();
        formData.append('mode', mode);
        
        const resp = await fetch('/api/startup', {
            method: 'POST',
            body: formData
        });
        
        if (resp.ok) {
            setStatus(`Startup mode set to: ${mode}`, false);
        } else {
            setStatus(`Failed to set startup mode: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Error setting startup mode: ${err.message}`, true);
    }
}

// ==============================================================================
// Playlists Fetching
// ==============================================================================
async function fetchPlaylists() {
    try {
        const resp = await fetch('/api/playlists');
        const data = await resp.json();
        const startupSelect = document.getElementById('startupSelect');
        
        if (startupSelect && data.files) {
            const currentValue = startupSelect.value;
            startupSelect.innerHTML = '<option value="all_on">ALL LEDS 100% ON</option>';
            
            data.files.forEach(file => {
                const opt = document.createElement('option');
                opt.value = file;
                let title = file.replace('.json', '').replace(/_/g, ' ').toUpperCase();
                opt.textContent = `PLAYLIST: ${title}`;
                startupSelect.appendChild(opt);
            });
            
            // Re-apply value if it exists in the newly populated list
            const exists = Array.from(startupSelect.options).some(opt => opt.value === currentValue);
            if (exists) {
                startupSelect.value = currentValue;
            }
        }
    } catch (err) {
        console.error('Error fetching playlists:', err);
    }
}

async function previewStartupMode() {
    const startupSelect = document.getElementById('startupSelect');
    if (!startupSelect) return;
    
    const mode = startupSelect.value;
    
    try {
        const formData = new FormData();
        if (mode === 'all_on') {
            formData.append('action', 'all_on');
        } else if (mode.endsWith('.json')) {
            formData.append('action', 'play_playlist');
            formData.append('file', mode);
        } else {
            formData.append('action', 'play_playlist');
            const matrixSelect = document.getElementById('matrixSelect');
            const fallback = (matrixSelect && matrixSelect.value === 'adafruit_16x9') ? 'startup_16x9.json' : 'startup_40x3.json';
            formData.append('file', fallback);
        }
        
        const resp = await fetch('/api/trigger', {
            method: 'POST',
            body: formData
        });
        
        if (resp.ok) {
            setStatus(`Previewing startup mode: ${mode}`, false);
        } else {
            setStatus(`Failed to preview startup mode: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Error previewing startup mode: ${err.message}`, true);
    }
}
