// Global State
window.currentUser = null;
window.chartInstances = {};
window.allStudents = [];
window.selectedStudentId = null;
window.currentViewedStudent = null;

window.dashboardFilters = null;

function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if(show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

async function loadDashboardFilters() {
    if (window.dashboardFilters) return;
    const res = await apiFetch('/dashboard/filters');
    if (!res) return;
    window.dashboardFilters = await res.json();
    
    const courseSelect = document.getElementById('filter-course');
    const classSelect = document.getElementById('filter-class');
    
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">Tất cả môn học</option>';
        for (const course in window.dashboardFilters) {
            courseSelect.innerHTML += `<option value="${course}">${course}</option>`;
        }
    }
    
    if (classSelect) {
        classSelect.innerHTML = '<option value="">Tất cả lớp học</option>';
        const allSet = new Set();
        for (const c in window.dashboardFilters) {
            window.dashboardFilters[c].forEach(cls => allSet.add(cls));
        }
        const sortedClasses = Array.from(allSet).sort();
        for (const cls of sortedClasses) {
            classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        }
    }
}

window.handleCourseChange = function() {
    const course = document.getElementById('filter-course').value;
    const classSelect = document.getElementById('filter-class');
    const currentClass = classSelect.value;
    
    classSelect.innerHTML = '<option value="">Tất cả lớp học</option>';
    
    if (course && window.dashboardFilters[course]) {
        for (const cls of window.dashboardFilters[course]) {
            const selected = (cls === currentClass) ? 'selected' : '';
            classSelect.innerHTML += `<option value="${cls}" ${selected}>${cls}</option>`;
        }
    } else if (!course) {
        const allSet = new Set();
        for (const c in window.dashboardFilters) {
            window.dashboardFilters[c].forEach(cls => allSet.add(cls));
        }
        const sortedClasses = Array.from(allSet).sort();
        for (const cls of sortedClasses) {
            const selected = (cls === currentClass) ? 'selected' : '';
            classSelect.innerHTML += `<option value="${cls}" ${selected}>${cls}</option>`;
        }
    }
    
    reloadCurrentTab();
}

window.handleClassChange = function() {
    reloadCurrentTab();
}

window.getFilterQueryString = function() {
    const course = document.getElementById('filter-course')?.value || '';
    const className = document.getElementById('filter-class')?.value || '';
    const query = new URLSearchParams();
    if (course) query.append('course', course);
    if (className) query.append('class_name', className);
    return query.toString() ? `?${query.toString()}` : '';
}

async function reloadCurrentTab() {
    const activeNav = document.querySelector('.nav-item.active');
    if (!activeNav) return;
    
    showLoading(true);
    const tabId = activeNav.id.replace('nav-', '');
    try {
        if (tabId === 'overview') {
            if (typeof loadSummary === 'function') await loadSummary();
        } else if (tabId === 'early-warning') {
            if (typeof loadEarlyWarning === 'function') await loadEarlyWarning();
        } else if (tabId === 'student-analysis') {
            if (typeof loadStudentList === 'function') await loadStudentList();
        } else if (tabId === 'anomaly-detection') {
            if (typeof loadIntegrityData === 'function') await loadIntegrityData();
        } else if (tabId === 'interventions') {
            if (typeof loadInterventions === 'function') await loadInterventions();
        }
    } finally {
        showLoading(false);
    }
}

async function initDashboard() {
    showLoading(true);
    try {
        await loadDashboardFilters();
        // Only load the current active tab data
        await reloadCurrentTab();
    } catch (error) {
        console.error("Initialization Error:", error);
    } finally {
        showLoading(false);
    }
}

function switchTab(tabId) {
    // Hide all
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });
    
    // Deactive all navs
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        el.classList.add('opacity-70');
    });
    
    // Show target
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}`).classList.add('block');
    
    // Active target nav
    const activeNav = document.getElementById(`nav-${tabId}`);
    activeNav.classList.add('active');
    activeNav.classList.remove('opacity-70');

    // Toggle filter visibility
    const filterContainer = document.getElementById('global-filters');
    if (filterContainer) {
        if (tabId === 'settings' || tabId === 'early-warning') {
            // Early warning already shows students by risk logic, maybe filter applies but usually it's list of risky
            // For now let's keep it visible for early warning, but hide for settings
            if (tabId === 'settings') {
                filterContainer.classList.add('hidden');
            } else {
                filterContainer.classList.remove('hidden');
            }
        } else {
            filterContainer.classList.remove('hidden');
        }
    }

    // Refresh data if needed
    if(tabId === 'settings' && typeof loadModelMetrics === 'function') {
        loadModelMetrics();
    } else {
        reloadCurrentTab();
    }
    
    // Cập nhật Page Title
    document.getElementById('page-title').innerText = activeNav.querySelector('span').innerText;
}

// Download CSV Template logic
window.downloadTemplate = async function() {
    try {
        const response = await apiFetch('/download-template', { method: 'GET' });
        if (response && response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "LMS_Analytics_Template.csv";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            alert("Không thể tải file mẫu. Vui lòng thử lại sau.");
        }
    } catch (error) {
        console.error("Download error:", error);
        alert("Đã xảy ra lỗi khi tải file mẫu.");
    }
}

// Upload CSV Data logic
window.uploadCSVFile = async function(event) {
    event.preventDefault();
    const fileInput = document.getElementById('csv-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Vui lòng chọn một file CSV.");
        return;
    }

    const file = fileInput.files[0];
    
    // Quick Frontend Header Check
    const isHeaderValid = await validateCSVHeader(file);
    if (!isHeaderValid) return; // Error message handled inside validateCSVHeader

    const formData = new FormData();
    formData.append("file", file);

    const btn = document.getElementById('btn-upload-csv');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang xử lý...';
    btn.disabled = true;
    btn.classList.add("opacity-75", "cursor-not-allowed");

    try {
        const response = await apiFetch('/upload-csv', {
            method: 'POST',
            body: formData
        });

        if (response && response.ok) {
            const data = await response.json();
            alert(data.message || "Tải lên thành công!");
            fileInput.value = ""; // clear text
            reloadCurrentTab(); // Refresh data
        } else if (response) {
            const err = await response.json();
            alert("Lỗi cấu trúc hoặc dữ liệu:\n" + (err.detail || "Không thể tải file lên máy chủ."));
        }
    } catch (error) {
        console.error("Upload error:", error);
        alert("Đã xảy ra lỗi kết nối khi tải file lên.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove("opacity-75", "cursor-not-allowed");
    }
}

async function validateCSVHeader(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const header = text.split('\n')[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            
            const baseCols = ['student_id', 'full_name', 'email', 'class', 'course'];
            const metrics = [
                'active_days', 'login_count', 'video_views', 'document_reads', 'discussion',
                'assignment_duration_mins', 'ontime_margin', 'weekly_score', 
                'days_since_last_login', 'session_duration'
            ];
            
            const missing = [];
            baseCols.forEach(c => { if (!header.includes(c)) missing.push(c); });
            
            // Check weeks 1-3 (minimum required for prediction)
            [1, 2, 3].forEach(w => {
                metrics.forEach(m => {
                    const col = `${m}_w${w}`;
                    if (!header.includes(col)) missing.push(col);
                });
            });

            if (missing.length > 0) {
                alert(`File CSV thiếu các cột bắt buộc:\n${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}\n\nVui lòng tải và sử dụng File Mẫu.`);
                resolve(false);
            } else {
                resolve(true);
            }
        };
        // Read only the first 2KB for efficiency
        reader.readAsText(file.slice(0, 2048));
    });
}

