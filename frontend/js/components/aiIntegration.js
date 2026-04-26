function getApiKey() {
    const settingsStr = localStorage.getItem('edu_settings');
    let key = '';
    if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        key = settings.geminiKey || '';
    }

    if (!key) {
        UIHelpers.showNotification("Vui lòng cấu hình Gemini API Key trong phần Cài đặt trước khi dùng tính năng AI.", "warning");
        if (typeof switchTab === 'function') switchTab('settings');
        return null;
    }
    return key;
}

// Hàm đơn giản để parse Markdown (in đậm, xuống dòng) sang HTML
function parseMarkdownToHTML(text) {
    if (!text) return "";
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-800">$1</strong>'); // In đậm
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>'); // In nghiêng
    html = html.replace(/\n/g, '<br>'); // Xuống dòng
    return html;
}

async function explainWithAI() {
    const apiKey = getApiKey();
    if (!apiKey || !window.currentViewedStudent) return;
    
    const btn = document.getElementById('btn-explain-ai');
    const box = document.getElementById('ai-explanation-box');
    const textEl = document.getElementById('ai-explanation-text');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang phân tích...';
    
    box.classList.remove('hidden');
    textEl.innerHTML = 'Đang phân tích dữ liệu...';
    
    const payload = {
        api_key: apiKey,
        student_data: {
            name: window.currentViewedStudent.full_name,
            course: window.currentViewedStudent.course_name,
            subject_id: window.currentViewedStudent.subject_id,
            class: window.currentViewedStudent.class_name,
            logs: window.currentViewedStudent.weekly_data.slice(-4),
            prediction: window.currentLatestPrediction || null
        }
    };
    
    try {
        const res = await apiFetch('/ai/explain', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (res && res.ok) {
            textEl.innerHTML = parseMarkdownToHTML(result.explanation);
        } else {
            textEl.innerHTML = "Lỗi khi gọi AI: " + (result.detail || "Không xác định");
        }
    } catch (e) {
        textEl.innerHTML = "Lỗi mạng hoặc server.";
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2 text-yellow-200"></i> AI Giải thích';
    }
}

async function draftEmailWithAI() {
    const apiKey = getApiKey();
    if (!apiKey || !window.selectedStudentId) return;
    
    let targetStudent = window.currentViewedStudent;
    if (!targetStudent || targetStudent.student_id !== window.selectedStudentId) {
        targetStudent = window.allStudents.find(s => s.student_id === window.selectedStudentId);
    }
    
    const interventionType = document.getElementById('intervention-type').value;
    const btn = document.getElementById('btn-draft-ai');
    const noteEl = document.getElementById('intervention-note');
    
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang soạn...';
    
    const payload = {
        api_key: apiKey,
        student_data: {
            name: targetStudent ? targetStudent.full_name : "Sinh viên",
            course: targetStudent ? targetStudent.course_name : "Môn học chưa rõ",
            class: targetStudent ? targetStudent.class_name : ""
        },
        intervention_type: interventionType,
        note: noteEl.value 
    };
    
    try {
        const res = await apiFetch('/ai/draft-email', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (res && res.ok) {
            noteEl.value = result.email_draft;
        } else {
            UIHelpers.showNotification("Lỗi khi gọi AI: " + (result.detail || "Không xác định"), "error");
        }
    } catch (e) {
        UIHelpers.showNotification("Lỗi mạng hoặc server.", "error");
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
}
