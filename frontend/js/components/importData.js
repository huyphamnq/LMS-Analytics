/**
 * Import Data Component - Redesigned
 * Layout: stepper at top, single-screen with subject select + file upload combined
 * Features: visual step indicator, drag-drop CSV, no alert(), proper notifications
 */

let importStep = 1;
let selectedSubjectId = null;
let selectedSubjectName = null;
let uploadedFile = null;
let importResults = null;
let _availableSubjects = [];
let overwriteMode = false;

async function initImportData() {
    importStep = 1;
    selectedSubjectId = null;
    selectedSubjectName = null;
    uploadedFile = null;
    importResults = null;
    overwriteMode = false;
    await loadAvailableSubjects();
    renderImportPage();
}

async function loadAvailableSubjects() {
    try {
        const response = await apiFetch('/subjects/list');
        if (!response || !response.ok) return;
        const data = await response.json();
        _availableSubjects = data.subjects || [];
    } catch (e) {
        console.error('Error loading subjects:', e);
        _availableSubjects = [];
    }
}

function renderImportPage() {
    const container = document.getElementById('import-data-container');
    if (!container) return;

    container.innerHTML = `
    <div class="space-y-6">
        <!-- Step indicator -->
        ${renderStepIndicator()}

        <!-- Step content -->
        <div id="import-step-content">
            ${renderCurrentStep()}
        </div>
    </div>`;
}

function renderStepIndicator() {
    const steps = [
        { num: 1, label: 'Chọn môn học', icon: 'fa-book' },
        { num: 2, label: 'Tải file CSV',  icon: 'fa-file-csv' },
        { num: 3, label: 'Xác nhận',      icon: 'fa-clipboard-check' },
        { num: 4, label: 'Hoàn thành',    icon: 'fa-circle-check' },
    ];

    const stepsHtml = steps.map((s, idx) => {
        const isDone    = importStep > s.num;
        const isActive  = importStep === s.num;
        const isLast    = idx === steps.length - 1;

        const circleClass = isDone
            ? 'bg-green-500 text-white border-green-500'
            : isActive
            ? 'bg-primary text-white border-primary shadow-md'
            : 'bg-white text-slate-400 border-slate-200';

        const textClass = isDone
            ? 'text-green-600 font-medium'
            : isActive
            ? 'text-primary font-semibold'
            : 'text-slate-400';

        const lineClass = isDone
            ? 'bg-green-400'
            : 'bg-slate-200';

        return `
        <div class="flex items-center ${isLast ? '' : 'flex-1'}">
            <div class="flex flex-col items-center">
                <div class="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${circleClass}">
                    ${isDone
                        ? '<i class="fa-solid fa-check text-sm"></i>'
                        : `<i class="fa-solid ${s.icon} text-sm"></i>`}
                </div>
                <span class="text-xs mt-1.5 transition-all ${textClass} hidden sm:block">${s.label}</span>
            </div>
            ${!isLast ? `<div class="flex-1 h-0.5 mx-2 mb-4 rounded-full transition-all ${lineClass}"></div>` : ''}
        </div>`;
    }).join('');

    return `<div class="flex items-start px-2">${stepsHtml}</div>`;
}

function refreshStepContent() {
    const container = document.getElementById('import-data-container');
    if (!container) return;
    container.innerHTML = `
    <div class="space-y-6">
        ${renderStepIndicator()}
        <div id="import-step-content">${renderCurrentStep()}</div>
    </div>`;
}

function renderCurrentStep() {
    if (importStep === 1) return renderStep1();
    if (importStep === 2) return renderStep2();
    if (importStep === 3) return renderStep3();
    if (importStep === 4) return renderStep4();
    return '';
}

/* ========== STEP 1: Chọn môn học ========== */
function renderStep1() {
    const subjectsOptions = _availableSubjects.length === 0
        ? `<option value="" disabled>Chưa có mô hình nào được tải lên</option>`
        : [`<option value="">-- Chọn môn học --</option>`,
           ..._availableSubjects.map(s => {
                const acc = s.accuracy > 1 ? s.accuracy.toFixed(1) : (s.accuracy * 100).toFixed(1);
                return `<option value="${s.subject_id}" data-name="${s.subject_name}">
                    ${s.subject_name} · v${s.version} · ${acc}% accuracy
                </option>`;
           })].join('');

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100">
            <h3 class="font-semibold text-slate-800">Chọn môn học</h3>
            <p class="text-sm text-slate-500 mt-0.5">Dữ liệu CSV sẽ được dự đoán bằng mô hình của môn học này</p>
        </div>

        <div class="p-6 space-y-4">
            ${_availableSubjects.length === 0 ? `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
                <div>
                    <p class="text-sm font-medium text-amber-800">Chưa có mô hình nào</p>
                    <p class="text-xs text-amber-700 mt-0.5">Vui lòng tải lên mô hình trước ở trang <strong>Quản lý Mô hình AI</strong>.</p>
                </div>
            </div>` : ''}

            <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Môn học</label>
                <select id="import-subject-select"
                    class="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                    ${subjectsOptions}
                </select>
            </div>

            <!-- Subject cards for quick select -->
            ${_availableSubjects.length > 0 ? `
            <div>
                <p class="text-xs text-slate-400 mb-2">Hoặc chọn nhanh:</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    ${_availableSubjects.map(s => {
                        const acc = s.accuracy > 1 ? s.accuracy.toFixed(1) : (s.accuracy * 100).toFixed(1);
                        return `<button type="button" onclick="quickSelectSubject('${s.subject_id}','${s.subject_name}')"
                            class="subject-quick-btn text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group"
                            data-id="${s.subject_id}">
                            <p class="text-xs font-semibold text-slate-700 group-hover:text-primary truncate">${s.subject_name}</p>
                            <p class="text-[11px] text-slate-400 mt-0.5 font-mono">${acc}% · v${s.version}</p>
                        </button>`;
                    }).join('')}
                </div>
            </div>` : ''}
        </div>

        <div class="px-6 pb-5 flex justify-end">
            <button type="button" onclick="goToStep2()"
                class="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 ${_availableSubjects.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}">
                Tiếp tục <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    </div>`;
}

function quickSelectSubject(id, name) {
    const sel = document.getElementById('import-subject-select');
    if (sel) sel.value = id;
    document.querySelectorAll('.subject-quick-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-blue-50');
        if (btn.dataset.id === id) btn.classList.add('border-primary', 'bg-blue-50');
    });
}

function goToStep2() {
    const sel = document.getElementById('import-subject-select');
    if (!sel || !sel.value) {
        showImportNotification('Vui lòng chọn môn học', 'warning');
        return;
    }
    selectedSubjectId = sel.value;
    const opt = sel.options[sel.selectedIndex];
    selectedSubjectName = opt.dataset.name || opt.textContent.trim().split('·')[0].trim();
    importStep = 2;
    refreshStepContent();
}

/* ========== STEP 2: Upload CSV ========== */
function renderStep2() {
    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
                <h3 class="font-semibold text-slate-800">Tải lên file CSV</h3>
                <p class="text-sm text-slate-500 mt-0.5">Môn: <span class="font-medium text-primary">${selectedSubjectName}</span></p>
            </div>
            <span class="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-full font-mono">${selectedSubjectId}</span>
        </div>

        <div class="p-6 space-y-4">
            <!-- Drag-drop zone -->
            <div id="csv-drop-zone"
                class="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center cursor-pointer hover:border-primary/60 hover:bg-blue-50/50 transition-all"
                ondragover="csvDragOver(event)" ondragleave="csvDragLeave(event)" ondrop="csvDrop(event)"
                onclick="document.getElementById('csv-file-input').click()">
                <input type="file" id="csv-file-input" accept=".csv" class="hidden" onchange="csvFileSelect(event)">
                <i class="fa-solid fa-file-csv text-4xl text-slate-300 block mb-3"></i>
                <p class="text-slate-500 font-medium text-sm">Kéo thả file CSV vào đây</p>
                <p class="text-slate-400 text-xs mt-1">hoặc <span class="text-primary underline">nhấn để chọn file</span></p>
                <p class="text-slate-300 text-xs mt-3">Chỉ chấp nhận định dạng .csv · Tối đa 10MB</p>
            </div>

            <!-- File preview (hidden by default) -->
            <div id="csv-file-preview" class="hidden bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-file-csv text-green-600"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p id="csv-file-name" class="font-medium text-green-800 text-sm truncate">—</p>
                    <p id="csv-file-size" class="text-xs text-green-600">—</p>
                </div>
                <button type="button" onclick="clearCsvFile()" class="text-green-400 hover:text-red-500 transition-colors" title="Xóa file">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Column format guide -->
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    <i class="fa-solid fa-table-cells mr-1"></i> Cấu trúc file CSV yêu cầu
                </p>
                <p class="text-xs text-slate-500 mb-2">Các cột bắt buộc: <code class="bg-white px-1 rounded border border-slate-200">student_id · full_name · email · class · course</code></p>
                <p class="text-xs text-slate-500">+ 30 cột metrics: <code class="bg-white px-1 rounded border border-slate-200">feature_w1, feature_w2, feature_w3</code> (10 đặc trưng × 3 tuần, bao gồm weekly_score)</p>
                <button type="button" onclick="downloadCsvTemplate()"
                    class="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                    <i class="fa-solid fa-download"></i> Tải file mẫu CSV
                </button>
            </div>
        </div>

        <div class="px-6 pb-5 flex justify-between">
            <button type="button" onclick="goBack()" class="px-5 py-2.5 text-slate-600 rounded-xl font-medium hover:bg-slate-100 transition-all flex items-center gap-2">
                <i class="fa-solid fa-arrow-left"></i> Quay lại
            </button>
            <button type="button" onclick="goToStep3()"
                class="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2">
                Xem lại <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    </div>`;
}

function csvDragOver(e) {
    e.preventDefault();
    document.getElementById('csv-drop-zone').classList.add('border-primary', 'bg-blue-50');
}
function csvDragLeave(e) {
    document.getElementById('csv-drop-zone').classList.remove('border-primary', 'bg-blue-50');
}
function csvDrop(e) {
    e.preventDefault();
    csvDragLeave(e);
    const file = e.dataTransfer.files[0];
    if (file) applyCsvFile(file);
}
function csvFileSelect(e) {
    const file = e.target.files[0];
    if (file) applyCsvFile(file);
}
function applyCsvFile(file) {
    if (!file.name.endsWith('.csv')) {
        showImportNotification('Chỉ chấp nhận file định dạng .csv', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showImportNotification('File quá lớn. Tối đa 10MB.', 'error');
        return;
    }
    uploadedFile = file;

    const preview = document.getElementById('csv-file-preview');
    const nameEl = document.getElementById('csv-file-name');
    const sizeEl = document.getElementById('csv-file-size');
    const dropZone = document.getElementById('csv-drop-zone');

    if (preview) preview.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (dropZone) dropZone.classList.add('hidden');
}
function clearCsvFile() {
    uploadedFile = null;
    const preview = document.getElementById('csv-file-preview');
    const dropZone = document.getElementById('csv-drop-zone');
    if (preview) preview.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
    const input = document.getElementById('csv-file-input');
    if (input) input.value = '';
}
function downloadCsvTemplate() {
    if (typeof window.downloadTemplate === 'function') {
        window.downloadTemplate();
    } else {
        window.location.href = '/v1/download-template';
    }
}
function goToStep3() {
    if (!uploadedFile) {
        showImportNotification('Vui lòng chọn file CSV', 'warning');
        return;
    }
    importStep = 3;
    refreshStepContent();
}

/* ========== STEP 3: Xác nhận ========== */
function renderStep3() {
    const sizeKB = uploadedFile ? (uploadedFile.size / 1024).toFixed(1) : 0;
    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100">
            <h3 class="font-semibold text-slate-800">Xác nhận import</h3>
            <p class="text-sm text-slate-500 mt-0.5">Kiểm tra lại thông tin trước khi thực hiện</p>
        </div>

        <div class="p-6 space-y-4">
            <!-- Summary cards -->
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p class="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1.5">
                        <i class="fa-solid fa-brain mr-1"></i> Mô hình sẽ dùng
                    </p>
                    <p class="text-sm font-semibold text-blue-800 truncate">${selectedSubjectName}</p>
                    <p class="text-xs text-blue-500 font-mono mt-0.5">${selectedSubjectId}</p>
                </div>
                <div class="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p class="text-xs text-green-500 font-semibold uppercase tracking-wide mb-1.5">
                        <i class="fa-solid fa-file-csv mr-1"></i> File sẽ import
                    </p>
                    <p class="text-sm font-semibold text-green-800 truncate">${uploadedFile ? uploadedFile.name : '—'}</p>
                    <p class="text-xs text-green-500 mt-0.5">${sizeKB} KB</p>
                </div>
            </div>

            <!-- What will happen -->
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Hệ thống sẽ thực hiện</p>
                ${[
                    ['fa-tag', 'Gán tự động subject_id = ' + selectedSubjectId + ' cho tất cả sinh viên'],
                    ['fa-database', 'Import dữ liệu sinh viên vào cơ sở dữ liệu'],
                    ['fa-robot', 'Chạy dự đoán rủi ro tự động với mô hình đã chọn'],
                    ['fa-save', 'Lưu kết quả dự đoán vào hệ thống'],
                ].map(([icon, text]) => `
                <div class="flex items-center gap-2.5 text-xs text-slate-600">
                    <i class="fa-solid ${icon} text-primary/60 w-4 text-center"></i>
                    ${text}
                </div>`).join('')}
            </div>

            <!-- Warning for duplicate data -->
            ${overwriteMode ? `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 animate-pulse">
                <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
                <div>
                    <p class="text-sm font-semibold text-amber-800">Dữ liệu đã tồn tại</p>
                    <p class="text-xs text-amber-700 mt-0.5">Hệ thống phát hiện lớp này đã có dữ liệu. Nếu tiếp tục, dữ liệu cũ sẽ bị <strong>ghi đè</strong> bằng dữ liệu mới nhất từ file này.</p>
                </div>
            </div>` : ''}

            <!-- Loading progress (hidden) -->
            <div id="import-progress" class="hidden bg-blue-50 rounded-xl border border-blue-100 p-5 text-center">
                <i class="fa-solid fa-spinner fa-spin text-primary text-2xl block mb-2"></i>
                <p class="text-sm font-medium text-blue-700">Đang import và phân tích dữ liệu...</p>
                <p class="text-xs text-blue-500 mt-1">Quá trình này có thể mất vài giây</p>
            </div>
        </div>

        <div class="px-6 pb-5 flex justify-between">
            <button type="button" onclick="goBack()" class="px-5 py-2.5 text-slate-600 rounded-xl font-medium hover:bg-slate-100 transition-all flex items-center gap-2">
                <i class="fa-solid fa-arrow-left"></i> Quay lại
            </button>
            
            <div class="flex gap-2">
                ${overwriteMode ? `
                    <button type="button" id="confirm-import-btn" onclick="confirmImport(true, event)"
                        class="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-all shadow-sm flex items-center gap-2">
                        <i class="fa-solid fa-triangle-exclamation"></i> Vẫn ghi đè dữ liệu
                    </button>
                ` : `
                    <button type="button" id="confirm-import-btn" onclick="confirmImport(false, event)"
                        class="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all shadow-sm flex items-center gap-2">
                        <i class="fa-solid fa-check"></i> Xác nhận Import
                    </button>
                `}
            </div>
        </div>
    </div>`;
}

/* ========== STEP 4: Kết quả ========== */
function renderStep4() {
    const success = importResults && !importResults.error;
    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div class="p-8 text-center">
            <div class="w-16 h-16 rounded-2xl ${success ? 'bg-green-100' : 'bg-red-50'} flex items-center justify-center mx-auto mb-4">
                <i class="fa-solid ${success ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-500'} text-3xl"></i>
            </div>
            <h3 class="text-xl font-bold ${success ? 'text-green-700' : 'text-red-700'}">
                ${success ? 'Import thành công!' : 'Import thất bại'}
            </h3>
            <p class="text-slate-500 text-sm mt-2">
                ${success
                    ? `Đã xử lý và dự đoán cho <strong class="text-slate-700">${importResults.synced || 0} sinh viên</strong>`
                    : (importResults?.error || 'Đã xảy ra lỗi không xác định')}
            </p>
        </div>

        ${success ? `
        <div class="mx-6 mb-6 bg-slate-50 rounded-xl p-4 space-y-2">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Bước tiếp theo</p>
            ${[
                ['fa-chart-bar', 'Xem kết quả dự đoán trên Dashboard'],
                ['fa-bell', 'Kiểm tra cảnh báo sớm (Early Warning)'],
                ['fa-comments', 'Thực hiện can thiệp cho sinh viên nguy cơ cao'],
            ].map(([icon, text]) => `
            <div class="flex items-center gap-2.5 text-xs text-slate-600">
                <i class="fa-solid ${icon} text-primary/60 w-4 text-center"></i> ${text}
            </div>`).join('')}
        </div>

        <div class="px-6 pb-6 grid grid-cols-2 gap-3">
            <button type="button" onclick="resetAndNewImport()" class="py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-rotate-right"></i> Import tiếp
            </button>
            <button type="button" onclick="goToDashboard()" class="py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-chart-line"></i> Xem Dashboard
            </button>
        </div>
        ` : `
        <div class="px-6 pb-6">
            <button type="button" onclick="importStep=2; refreshStepContent()" class="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-arrow-left"></i> Thử lại
            </button>
        </div>
        `}
    </div>`;
}

/* ========== Navigation helpers ========== */
function goBack() {
    if (importStep > 1) {
        importStep--;
        refreshStepContent();
    }
}

function resetAndNewImport() {
    importStep = 1;
    selectedSubjectId = null;
    selectedSubjectName = null;
    uploadedFile = null;
    importResults = null;
    overwriteMode = false;
    loadAvailableSubjects().then(() => refreshStepContent());
}

function goToDashboard() {
    if (typeof showTab === 'function') {
        showTab('overview');
    } else {
        window.location.hash = 'overview';
    }
}

/* ========== Import logic ========== */
async function confirmImport(overwrite = false, event = null) {
    if (event) event.preventDefault();
    
    const btn = document.getElementById('confirm-import-btn');
    const progress = document.getElementById('import-progress');
    const loadingText = document.getElementById('import-loading-text');

    if (btn) btn.disabled = true;
    if (progress) progress.classList.remove('hidden');
    if (loadingText) loadingText.innerText = overwrite ? 'Đang ghi đè dữ liệu...' : 'Đang tải dữ liệu lên hệ thống...';

    try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        if (selectedSubjectId) {
            formData.append('subject_id', selectedSubjectId);
        }
        if (overwrite) {
            formData.append('overwrite', 'true');
        }

        const token = localStorage.getItem('token');
        const baseUrl = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : 'http://127.0.0.1:8000/v1';
        const response = await fetch(`${baseUrl}/upload-csv`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        
        // Handle conflict - dữ liệu đã tồn tại
        if (response.status === 409 || result.error === 'DATA_EXISTS') {
            console.warn('⚠️ Conflict detected - data already exists');
            overwriteMode = true;
            importResults = null; // Clear any previous result
            if (progress) progress.classList.add('hidden');
            if (btn) btn.disabled = false;
            
            // Format details message
            const details = result.existing ? result.existing.map(e => `${e.course_name} (${e.class_name})`).join(', ') : 'Dữ liệu';
            showImportNotification(`❌ Dữ liệu của ${details} đã tồn tại! Vui lòng chọn ghi đè nếu muốn cập nhật.`, 'warning');
            
            // Make sure we stay on step 3, don't advance
            importStep = 3;
            
            // Re-render step 3 with overwrite warning
            refreshStepContent();
            return;
        }

        // Handle other errors
        if (!response.ok) {
            const errorMsg = result.detail || result.message || `Lỗi ${response.status}: Upload thất bại`;
            throw new Error(errorMsg);
        }

        // Success - move to step 4
        importResults = result;
        importStep = 4;
        if (progress) progress.classList.add('hidden');
        if (btn) btn.disabled = false;
        refreshStepContent();
        
    } catch (error) {
        console.error('❌ Import error:', error);
        showImportNotification(error.message || 'Đã xảy ra lỗi không xác định', 'error');
        importResults = null; // Clear results on error to prevent showing step 4
        importStep = 3; // Stay on step 3
        if (progress) progress.classList.add('hidden');
        if (btn) btn.disabled = false;
        // Stay on current step (step 3) after error
        refreshStepContent();
    }
}

/* ========== Notification helper ========== */
function showImportNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500',
    };
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info',
    };

    const el = document.createElement('div');
    el.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium ${colors[type] || colors.info} transition-all duration-300`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} shrink-0"></i><span>${message}</span>`;
    document.body.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 300);
    }, 3200);
}

// Alias for backward compat
function updateImportUI() { refreshStepContent(); }
