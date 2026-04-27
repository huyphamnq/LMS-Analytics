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
        } else if (tabId === 'intervention-history') {
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

function switchTab(tabId, event) {
    if (event) event.preventDefault();
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
        if (tabId === 'settings' || tabId === 'early-warning' || tabId === 'model-management' || tabId === 'import-data') {
            // Hide filters for settings, model management, and import data
            if (tabId === 'settings' || tabId === 'model-management' || tabId === 'import-data') {
                filterContainer.classList.add('hidden');
            } else {
                filterContainer.classList.remove('hidden');
            }
        } else {
            filterContainer.classList.remove('hidden');
        }
    }
    
    // Initialize specific tab components
    if (tabId === 'import-data') {
        if (typeof initImportData === 'function') {
            initImportData();
        }
    }

    // Render component-specific content
    if(tabId === 'model-management' && typeof ModelManagement !== 'undefined') {
        // Render model management component into the tab container
        const tabContainer = document.getElementById('tab-model-management');
        if (tabContainer) {
            // Render component (it will find the container itself)
            ModelManagement.render();
        }
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
            UIHelpers.showNotification("Không thể tải file mẫu. Vui lòng thử lại sau.", "error");
        }
    } catch (error) {
        console.error("Download error:", error);
        UIHelpers.showNotification("Đã xảy ra lỗi khi tải file mẫu.", "error");
    }
}

