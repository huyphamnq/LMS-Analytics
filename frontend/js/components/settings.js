async function saveSettings() {
    const geminiKey = document.getElementById('set-gemini-key').value;
    const emailSender = document.getElementById('set-email-sender').value;
    const emailPass = document.getElementById('set-email-pass').value;
    const emailHost = document.getElementById('set-email-host').value;
    const emailPort = document.getElementById('set-email-port').value;
    // Chỉ có 1 model hiện tại
    const selectedModel = 'Logistic Regression';

    const settings = {
        geminiKey,
        emailSender,
        emailPass,
        emailHost,
        emailPort,
        selectedModel
    };

    try {
        const response = await apiFetch('/settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        });

        if (response && response.ok) {
            localStorage.setItem('edu_settings', JSON.stringify(settings));
            
            // Show status
            const status = document.getElementById('save-status');
            status.classList.remove('opacity-0');
            status.classList.add('opacity-100');
            setTimeout(() => {
                status.classList.remove('opacity-100');
                status.classList.add('opacity-0');
            }, 3000);
            
            if (typeof initDashboard === 'function') initDashboard();
        } else if (response) {
            const data = await response.json();
            UIHelpers.showNotification("Lỗi khi lưu cài đặt: " + (data.detail || "Không xác định"), 'error');
        }
    } catch (error) {
        UIHelpers.showNotification("Không thể kết nối đến máy chủ để lưu cài đặt", 'error');
    }
}

async function loadSettings() {
    try {
        const response = await apiFetch('/settings');

        if (response && response.ok) {
            const settings = await response.json();
            localStorage.setItem('edu_settings', JSON.stringify(settings));
            
            if (document.getElementById('set-gemini-key')) {
                document.getElementById('set-gemini-key').value = settings.geminiKey || '';
                document.getElementById('set-email-sender').value = settings.emailSender || '';
                document.getElementById('set-email-pass').value = settings.emailPass || '';
                document.getElementById('set-email-host').value = settings.emailHost || 'smtp.gmail.com';
                document.getElementById('set-email-port').value = settings.emailPort || '587';
                // Model luôn là Logistic Regression, dropdown disabled
            }
        } else {
            const settingsStr = localStorage.getItem('edu_settings');
            if (settingsStr) {
                const settings = JSON.parse(settingsStr);
                if (document.getElementById('set-gemini-key')) {
                    document.getElementById('set-gemini-key').value = settings.geminiKey || '';
                    document.getElementById('set-email-sender').value = settings.emailSender || '';
                    document.getElementById('set-email-pass').value = settings.emailPass || '';
                    document.getElementById('set-email-host').value = settings.emailHost || 'smtp.gmail.com';
                    document.getElementById('set-email-port').value = settings.emailPort || '587';
                    // Model luôn là Logistic Regression
                }
            }
        }
    } catch (error) {
        console.error("Load settings error:", error);
    }
}

async function loadModelMetrics() {
    try {
        const res = await apiFetch('/ml/metrics');
        if (!res) return;
        const data = await res.json();
        
        const tbody = document.getElementById('model-metrics-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        data.forEach(m => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-50 hover:bg-slate-50/50 transition-colors";
            
            // Threshold có thể là 0-1 (từ model_config.pkl)
            const thresholdPct = m.threshold !== undefined ? (m.threshold * 100).toFixed(1) + '%' : 'N/A';
            const features = m.features !== undefined ? m.features : 'N/A';
            
            tr.innerHTML = `
                <td class="py-4 font-medium text-slate-700">${m.model}</td>
                <td class="py-4">
                    <span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">${(m.accuracy * 100).toFixed(0)}%</span>
                </td>
                <td class="py-4">
                    <span class="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${(m.f1 * 100).toFixed(0)}%</span>
                </td>
                <td class="py-4">
                    <span class="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg font-bold text-xs">${thresholdPct}</span>
                </td>
                <td class="py-4 text-slate-500 hidden md:table-cell font-mono text-xs">${features}</td>
                <td class="py-4 text-slate-500 hidden md:table-cell text-xs">${m.description}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Load metrics error:", error);
    }
}
