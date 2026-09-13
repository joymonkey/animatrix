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
const frameProgress = document.getElementById('frameProgress');
const statusMessage = document.getElementById('statusMessage');

// Polling interval
let pollTimer = null;

function setStatus(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? 'var(--red-glow)' : 'var(--cyan-glow)';
    setTimeout(() => {
        statusMessage.textContent = '';
    }, 4000);
}

async function fetchStatus() {
    try {
        const resp = await fetch('/api/status');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Connection
        connPill.classList.add('connected');
        connStatusText.textContent = 'ONLINE';

        // Matrix Hardware
        if (data.matrix) {
            matrixType.textContent = (data.matrix.type || '--').toUpperCase();
            matrixRes.textContent = `${data.matrix.width || 0} x ${data.matrix.height || 0}`;
            i2cAddr.textContent = data.matrix.found ? `0x${(data.matrix.i2c_addr || 0).toString(16).toUpperCase()}` : 'DISCONNECTED';
        }

        // System
        if (data.system) {
            freeHeap.textContent = `${Math.round((data.system.free_heap || 0) / 1024)} KB`;
        }

        // Animation
        if (data.animation) {
            const anim = data.animation;
            animName.textContent = anim.name || 'NONE';
            animFps.textContent = `${anim.fps || 0} FPS`;
            animFrames.textContent = `${(anim.current_frame || 0) + 1} / ${anim.total_frames || 0}`;
            animLoop.textContent = (anim.loop || '--').toUpperCase();

            if (anim.playing) {
                playStateBadge.textContent = 'PLAYING';
                playStateBadge.classList.add('active');
            } else if (anim.loaded) {
                playStateBadge.textContent = 'PAUSED';
                playStateBadge.classList.remove('active');
            } else {
                playStateBadge.textContent = 'IDLE';
                playStateBadge.classList.remove('active');
            }

            if (anim.total_frames > 0) {
                const percent = Math.min(100, Math.round(((anim.current_frame + 1) / anim.total_frames) * 100));
                frameProgress.style.width = `${percent}%`;
            } else {
                frameProgress.style.width = '0%';
            }
        }
    } catch (err) {
        connPill.classList.remove('connected');
        connStatusText.textContent = 'OFFLINE';
    }
}

async function triggerAction(action) {
    try {
        const params = new URLSearchParams();
        params.append('action', action);

        const resp = await fetch('/api/trigger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (resp.ok) {
            setStatus(`Triggered: ${action.toUpperCase()}`);
            fetchStatus();
        } else {
            setStatus(`Trigger failed: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Network error: ${err.message}`, true);
    }
}

// Drag & Drop Upload
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
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFileUpload(fileInput.files[0]);
    }
});

async function handleFileUpload(file) {
    if (!file.name.endsWith('.json')) {
        setStatus('Please select an animatrix JSON file.', true);
        return;
    }

    setStatus(`Uploading ${file.name}...`);

    try {
        const text = await file.text();
        // Send raw JSON matching EspUploader.js contract
        const resp = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Animation-Name': file.name
            },
            body: text
        });

        if (resp.ok) {
            setStatus('Animation uploaded and playing!');
            setTimeout(fetchStatus, 500);
        } else {
            setStatus(`Upload failed: ${resp.status}`, true);
        }
    } catch (err) {
        setStatus(`Upload error: ${err.message}`, true);
    }
}

// Initial fetch and start polling loop
fetchStatus();
setInterval(fetchStatus, 1500);
