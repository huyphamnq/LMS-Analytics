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
let _existingSubjectData = [];
let subjectSearchQuery = '';
let overwriteMode = false;

const IMPORT_BASE_COLUMNS = ['student_id', 'full_name', 'email', 'class', 'course'];
const IMPORT_MODEL_METRICS = [
    'active_days',
    'login_count',
    'video_views',
    'document_reads',
    'discussion',
    'assignment_duration_mins',
    'ontime_margin',
    'days_since_last_login',
    'session_duration',
];
const IMPORT_REQUIRED_COLUMNS = [
    ...IMPORT_BASE_COLUMNS,
    ...[1, 2, 3].flatMap(week => [
        ...IMPORT_MODEL_METRICS.map(metric => `${metric}_w${week}`),
        `weekly_score_w${week}`,
    ]),
];

async function initImportData() {
    importStep = 1;
    selectedSubjectId = null;
    selectedSubjectName = null;
    uploadedFile = null;
    importResults = null;
    _existingSubjectData = [];
    subjectSearchQuery = '';
    overwriteMode = false;
    await loadAvailableSubjects();
    renderImportPage();
}

async function loadExistingSubjectData(subjectId) {
    try {
        const response = await apiFetch(`/subjects/${encodeURIComponent(subjectId)}/existing-data`);
        if (!response || !response.ok) {
            _existingSubjectData = [];
            return;
        }

        const data = await response.json();
        _existingSubjectData = data.existing || [];
    } catch (e) {
        console.error('Error loading existing subject data:', e);
        _existingSubjectData = [];
    }
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
        { num: 2, label: 'Tải file CSV', icon: 'fa-file-csv' },
        { num: 3, label: 'Xác nhận', icon: 'fa-clipboard-check' },
        { num: 4, label: 'Hoàn thành', icon: 'fa-circle-check' },
    ];

    const stepsHtml = steps.map((s, idx) => {
        const isDone = importStep > s.num;
        const isActive = importStep === s.num;
        const isLast = idx === steps.length - 1;

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
function getFilteredSubjects() {
    const query = subjectSearchQuery.trim().toLowerCase();
    if (!query) return _availableSubjects;

    return _availableSubjects.filter(subject => {
        const name = String(subject.subject_name || '').toLowerCase();
        const id = String(subject.subject_id || '').toLowerCase();
        return name.includes(query) || id.includes(query);
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSubjectCards(subjects) {
    if (_availableSubjects.length === 0) return '';

    if (subjects.length === 0) {
        return `
        <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <i class="fa-solid fa-magnifying-glass text-slate-300 text-xl mb-2"></i>
            <p class="text-sm font-medium text-slate-500">Không tìm thấy môn học</p>
            <p class="text-xs text-slate-400 mt-1">Thử tìm theo tên môn hoặc mã môn khác</p>
        </div>`;
    }

    return subjects.map(s => {
        const acc = s.accuracy > 1 ? s.accuracy.toFixed(1) : (s.accuracy * 100).toFixed(1);
        return `<button type="button" onclick="quickSelectSubjectFromButton(this)"
            class="subject-quick-btn text-left p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group"
            data-id="${escapeHtml(s.subject_id)}"
            data-name="${escapeHtml(s.subject_name)}">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-700 group-hover:text-primary truncate">${escapeHtml(s.subject_name)}</p>
                    <p class="text-[11px] text-slate-400 mt-1 font-mono">${escapeHtml(s.subject_id)} · v${escapeHtml(s.version)}</p>
                </div>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 shrink-0">${acc}%</span>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">Bấm để chọn môn này</p>
        </button>`;
    }).join('');
}

function renderStep1() {
    const filteredSubjects = getFilteredSubjects();

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

            ${_availableSubjects.length > 0 ? `
            <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Tìm kiếm môn học</label>
                <div class="relative">
                    <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input type="search" id="import-subject-search"
                        value="${escapeHtml(subjectSearchQuery)}"
                        oninput="updateSubjectSearch(this.value)"
                        placeholder="Nhập tên môn hoặc mã môn..."
                        class="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                </div>
                <p id="subject-search-count" class="text-xs text-slate-400 mt-1.5">${filteredSubjects.length}/${_availableSubjects.length} môn phù hợp</p>
            </div>` : ''}

            ${_availableSubjects.length > 0 ? `
            <div>
                <p class="text-xs text-slate-400 mb-2">Chọn môn học từ kết quả tìm kiếm:</p>
                <div id="subject-quick-list" class="${filteredSubjects.length > 0 ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3' : ''}">
                    ${renderSubjectCards(filteredSubjects)}
                </div>
            </div>` : ''}
        </div>
    </div>`;
}

function updateSubjectSearch(value) {
    subjectSearchQuery = value || '';
    const filteredSubjects = getFilteredSubjects();
    const list = document.getElementById('subject-quick-list');
    const count = document.getElementById('subject-search-count');

    if (list) {
        list.className = filteredSubjects.length > 0 ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3' : '';
        list.innerHTML = renderSubjectCards(filteredSubjects);
    }
    if (count) count.textContent = `${filteredSubjects.length}/${_availableSubjects.length} môn phù hợp`;
}

function quickSelectSubjectFromButton(button) {
    selectSubjectAndContinue(button.dataset.id, button.dataset.name);
}

function quickSelectSubject(id, name) {
    document.querySelectorAll('.subject-quick-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-blue-50');
        if (btn.dataset.id === id) btn.classList.add('border-primary', 'bg-blue-50');
    });
}

async function selectSubjectAndContinue(id, name) {
    if (!id) return;

    selectedSubjectId = id;
    selectedSubjectName = name || id;
    quickSelectSubject(id, name);
    await loadExistingSubjectData(selectedSubjectId);
    importStep = 2;
    refreshStepContent();
}

function renderExistingSubjectDataNotice() {
    if (_existingSubjectData.length === 0) return '';

    const shown = _existingSubjectData.slice(0, 6);
    const remaining = _existingSubjectData.length - shown.length;

    return `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div class="flex gap-3">
            <i class="fa-solid fa-circle-info text-amber-500 mt-0.5 shrink-0"></i>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-amber-800">Môn này đã có dữ liệu cho ${_existingSubjectData.length} lớp</p>
                <p class="text-xs text-amber-700 mt-0.5">Nếu CSV thuộc một trong các lớp bên dưới, hệ thống sẽ yêu cầu xác nhận ghi đè trước khi import.</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${shown.map(item => `
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-xs text-amber-800">
                            <i class="fa-solid fa-users text-amber-400"></i>
                            ${item.class_name} · ${item.student_count} SV
                        </span>
                    `).join('')}
                    ${remaining > 0 ? `<span class="px-2.5 py-1 rounded-lg bg-amber-100 text-xs text-amber-700">+${remaining} lớp khác</span>` : ''}
                </div>
            </div>
        </div>
    </div>`;
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
            ${renderExistingSubjectDataNotice()}

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
                <p class="text-xs text-slate-500 mb-2">+ 27 cột đặc trưng Random Forest: <code class="bg-white px-1 rounded border border-slate-200">active_days_w1 ... session_duration_w3</code></p>
                <p class="text-xs text-slate-500">+ 3 cột điểm tuần để lưu lịch sử: <code class="bg-white px-1 rounded border border-slate-200">weekly_score_w1 · weekly_score_w2 · weekly_score_w3</code></p>
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
async function applyCsvFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showImportNotification('Chỉ chấp nhận file định dạng .csv', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showImportNotification('File quá lớn. Tối đa 10MB.', 'error');
        return;
    }

    try {
        const missingColumns = await validateCsvHeader(file);
        if (missingColumns.length > 0) {
            const preview = missingColumns.slice(0, 8).join(', ');
            const suffix = missingColumns.length > 8 ? ` và ${missingColumns.length - 8} cột khác` : '';
            showImportNotification(`CSV thiếu cột: ${preview}${suffix}`, 'error');
            clearCsvFile();
            return;
        }
    } catch (error) {
        showImportNotification(error.message || 'Không thể đọc header của file CSV', 'error');
        clearCsvFile();
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

function normalizeCsvHeaderName(name) {
    return String(name || '').replace(/^\uFEFF/, '').trim().toLowerCase();
}

function splitCsvHeaderLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = line[i + 1];

        if (ch === '"' && inQuotes && next === '"') {
            current += '"';
            i++;
        } else if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            cells.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    cells.push(current);
    return cells;
}

function readFileStart(file, maxBytes = 64 * 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => reject(reader.error || new Error('Không thể đọc file CSV'));
        reader.readAsText(file.slice(0, maxBytes), 'utf-8');
    });
}

async function validateCsvHeader(file) {
    const text = await readFileStart(file);
    const firstLine = text.split(/\r?\n/).find(line => line.trim().length > 0);

    if (!firstLine) {
        throw new Error('File CSV không có dòng header');
    }

    const headers = splitCsvHeaderLine(firstLine).map(normalizeCsvHeaderName);
    return IMPORT_REQUIRED_COLUMNS.filter(col => !headers.includes(col));
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
                    <p class="text-xs text-blue-600 mt-1">Random Forest</p>
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
            ['fa-robot', 'Chạy dự đoán rủi ro tự động với Random Forest'],
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
    _existingSubjectData = [];
    subjectSearchQuery = '';
    overwriteMode = false;
    loadAvailableSubjects().then(() => refreshStepContent());
}

function goToDashboard() {
    if (typeof switchTab === 'function') {
        switchTab('overview');
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
