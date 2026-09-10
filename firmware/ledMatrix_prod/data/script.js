function setStatus(msg, color) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = msg;
    statusEl.style.color = color;
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000);
}

function triggerAction(actionType) {
    fetch('/trigger', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `type=${actionType}`
    })
    .then(response => {
        if (response.ok) {
            setStatus(`Triggered: ${actionType.toUpperCase()}`, 'var(--accent-color)');
        } else {
            setStatus('Error triggering action', 'var(--danger-color)');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        setStatus('Network error', 'var(--danger-color)');
    });
}

function uploadScript() {
    const fileInput = document.getElementById('scriptFile');
    const file = fileInput.files[0];
    
    if (!file) {
        setStatus('Please select a JSON file first.', 'var(--danger-color)');
        return;
    }

    const formData = new FormData();
    formData.append('script', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.ok) {
            setStatus('Script uploaded successfully!', 'var(--accent-color)');
            // Optionally, tell the server to run the uploaded script
            triggerAction('json_script');
        } else {
            setStatus('Upload failed.', 'var(--danger-color)');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        setStatus('Network error during upload', 'var(--danger-color)');
    });
}
