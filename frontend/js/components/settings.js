async function saveSettings() {
    const geminiKey = document.getElementById('set-gemini-key').value;
    const emailSender = document.getElementById('set-email-sender').value;
    const emailPass = document.getElementById('set-email-pass').value;
    const emailHost = document.getElementById('set-email-host').value;
    const emailPort = document.getElementById('set-email-port').value;

    const settings = {
        geminiKey,
        emailSender,
        emailPass,
        emailHost,
        emailPort
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
                }
            }
        }
    } catch (error) {
        console.error("Load settings error:", error);
    }
}
