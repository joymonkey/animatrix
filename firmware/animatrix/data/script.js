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

let currentActiveMatrix = 'adafruit_16x9';
let isRebooting = false;

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
            currentActiveMatrix = rawType;
            matrixType.textContent = (rawType === 'custom_40x3' || rawType === 'custom_3x40') ? '40x3 VISOR' : '16x9 ADA';
            matrixRes.textContent = `${data.matrix.width || 0} x ${data.matrix.height || 0}`;
            i2cAddr.textContent = data.matrix.found ? `0x${(data.matrix.i2c_addr || 0).toString(16).toUpperCase()}` : 'N/A';

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
// Animation Sequences List
// ==============================================================================
async function fetchAnimationList() {
    if (isRebooting) return;

    try {
        const resp = await fetch('/api/animations');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const currentVal = animSelect.value;
        animSelect.innerHTML = '';

        if (!data.files || data.files.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'NO ANIMATIONS ON BOARD';
            animSelect.appendChild(opt);
            return;
        }

        data.files.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            const sizeKb = (f.size / 1024).toFixed(1);
            opt.textContent = `${f.name.replace('.json', '').toUpperCase()} (${sizeKb} KB)`;
            animSelect.appendChild(opt);
        });

        if (currentVal && [...animSelect.options].some(o => o.value === currentVal)) {
            animSelect.value = currentVal;
        }
    } catch (err) {
        console.warn('Could not fetch animations list:', err);
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
    const sec = document.getElementById('hardwareSection');
    if (sec) {
        sec.scrollIntoView({ behavior: 'smooth' });
        sec.classList.add('highlight-section');
        setTimeout(() => sec.classList.remove('highlight-section'), 1500);
    }
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

dropZone.addEventListener('click', () => fileInput.click());

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
        const resp = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Animation-Name': file.name
            },
            body: text
        });

        if (resp.ok) {
            setStatus(`Loaded & playing ${file.name}!`);
            await fetchAnimationList();
            animSelect.value = file.name;
            setTimeout(fetchStatus, 400);
        } else {
            setStatus(`Upload failed: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Upload error: ${err.message}`, true);
    }
}

// ==============================================================================
// Initialization
// ==============================================================================
fetchStatus();
fetchAnimationList();
setInterval(fetchStatus, 1500);
