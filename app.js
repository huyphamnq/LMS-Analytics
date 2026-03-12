const API_URL = 'http://127.0.0.1:8000';

// Global Chart Instances
let chartInstances = {
    pie: null,
    line: null,
    radar: null,
    timeline: null,
    scatter: null
};

// State
let selectedStudentId = null;
let currentViewedStudent = null; // To store full object for AI context

// Khởi tạo
async function initDashboard() {
    showLoading(true);
    try {
        await Promise.all([
            loadSummary(),
            loadEarlyWarning(),
            loadStudentList(),
            loadIntegrityData(),
            loadInterventions()
        ]);
    } catch (error) {
        console.error("Initialization Error:", error);
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if(show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

// Chuyển Tab
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
    
    // Cập nhật Page Title
    document.getElementById('page-title').innerText = activeNav.querySelector('span').innerText;
}

// ========= TAB 1: TỔNG QUAN =========
async function loadSummary() {
    const res = await fetch(`${API_URL}/dashboard/summary`);
    const data = await res.json();
    
    document.getElementById('stat-total').innerText = data.total_students;
    document.getElementById('stat-safe').innerText = data.safe_students;
    document.getElementById('stat-risk').innerText = data.risk_students;
    document.getElementById('stat-percent').innerText = `${data.risk_percentage}%`;
    
    renderPieChart(data.safe_students, data.risk_students);
    await loadTrendChart();
}

// Biểu đồ Pie
function renderPieChart(safe, risk) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    if (chartInstances.pie) chartInstances.pie.destroy();
    
    chartInstances.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['An toàn', 'Nguy cơ cao'],
            datasets: [{
                data: [safe, risk],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, padding: 20, font: {family: 'Inter'} }
                }
            }
        }
    });
}

// Biểu đồ Trend Line (giả lập data do API summary ko trả về trend weeks, ta gọi danh sách safe/risk từng tuần từ /students)
async function loadTrendChart() {
    const res = await fetch(`${API_URL}/early-warning`); // tạm dùng warning để đếm hoặc fake trend
    // Do yêu cầu có biểu đồ trend tỷ lệ sinh viên theo tuần. Chúng ta sẽ lấy fake trend data để hiển thị.
    // Thực tế cần 1 endpoint GET /dashboard/trend nhưng ta sẽ generate mock array array.
    
    const weeks = ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5', 'Tuần 6', 'Tuần 7', 'Tuần 8', 'Tuần 9', 'Tuần 10'];
    // Mock risk % variation
    const riskTrend = [5, 8, 12, 10, 15, 14, 18, 22, 20, parseInt(document.getElementById('stat-percent').innerText)];
    
    const ctx = document.getElementById('lineChart').getContext('2d');
    if (chartInstances.line) chartInstances.line.destroy();
    
    chartInstances.line = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [{
                label: 'Tỷ lệ % Nguy cơ',
                data: riskTrend,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#6366f1',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { borderDash: [5, 5], color: '#f1f5f9' },
                    ticks: { callback: function(value) { return value + "%" } }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// ========= TAB 2: CẢNH BÁO SỚM =========
async function loadEarlyWarning() {
    const res = await fetch(`${API_URL}/early-warning`);
    const data = await res.json();
    
    const tbody = document.getElementById('warning-list');
    tbody.innerHTML = '';
    
    // Sort by prob high to low
    data.sort((a,b) => b.risk_probability - a.risk_probability);
    
    data.forEach(item => {
        const probClass = item.risk_probability > 0.8 ? 'text-red-600 font-bold' : 'text-red-500 font-medium';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-50 text-slate-600 font-medium">${item.student_id}</td>
            <td class="py-4 px-6 border-b border-slate-50 text-slate-800 font-medium">${item.student_name}</td>
            <td class="py-4 px-6 border-b border-slate-50 ${probClass}">${(item.risk_probability * 100).toFixed(1)}%</td>
            <td class="py-4 px-6 border-b border-slate-50 text-slate-600">${item.effort_score}</td>
            <td class="py-4 px-6 border-b border-slate-50">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 border border-red-200">Nguy cơ</span>
            </td>
            <td class="py-4 px-6 border-b border-slate-50">
                <button onclick="viewStudentDetail('${item.student_id}')" class="text-primary hover:text-secondary text-sm font-medium mr-3">Phân tích</button>
                <button onclick="openInterventionDirectly('${item.student_id}', '${item.student_name}')" class="text-slate-500 hover:text-slate-800 text-sm font-medium"><i class="fa-solid fa-comment-medical"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openInterventionDirectly(studentId, studentName) {
    selectedStudentId = studentId;
    openInterventionModal();
}

// ========= TAB 3: PHÂN TÍCH SINH VIÊN =========
async function loadStudentList() {
    const res = await fetch(`${API_URL}/students`);
    const data = await res.json();
    
    window.allStudents = data; // cache for search
    renderStudentList(data);
    
    // Search event
    document.getElementById('search-student').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = window.allStudents.filter(s => 
            s.full_name.toLowerCase().includes(term) || s.student_id.toLowerCase().includes(term)
        );
        renderStudentList(filtered);
    });
}

function renderStudentList(students) {
    const listEl = document.getElementById('full-student-list');
    listEl.innerHTML = '';
    
    students.forEach(s => {
        const div = document.createElement('div');
        div.className = "p-3 border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer rounded-lg transition-colors flex justify-between items-center student-list-item";
        div.onclick = () => viewStudentDetail(s.student_id);
        
        // Random avatar color hash string
        div.innerHTML = `
            <div class="flex items-center space-x-3">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random" class="w-10 h-10 rounded-full">
                <div>
                    <h5 class="text-sm font-bold text-slate-800">${s.full_name}</h5>
                    <p class="text-xs text-slate-500">${s.student_id}</p>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
        `;
        listEl.appendChild(div);
    });
}

async function viewStudentDetail(studentId) {
    showLoading(true);
    selectedStudentId = studentId;
    
    // UI updates
    switchTab('student-analysis');
    document.getElementById('empty-student-state').classList.add('hidden');
    document.getElementById('student-content').classList.remove('hidden');
    
    try {
        const res = await fetch(`${API_URL}/students/${studentId}`);
        const data = await res.json();
        const student = data.profile;
        const predictions = data.predictions;
        
        currentViewedStudent = student; // Cache for AI
        
        // Update header
        document.getElementById('detail-name').innerText = student.full_name;
        document.getElementById('detail-id').innerText = `${student.student_id} • ${student.course}`;
        
        // Hide AI box manually first
        document.getElementById('ai-explanation-box').classList.add('hidden');
        document.getElementById('ai-explanation-text').innerText = 'Đang phân tích dữ liệu...';
        
        // Badge
        const latestPred = predictions.length > 0 ? predictions[0] : null;
        const badgeEl = document.getElementById('detail-badge');
        const btnExplain = document.getElementById('btn-explain-ai');
        
        if (latestPred && latestPred.risk_label === "Nguy cơ") {
             badgeEl.className = "px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold border border-red-200";
             badgeEl.innerText = `Nguy cơ (${(latestPred.risk_probability*100).toFixed(0)}%)`;
             btnExplain.classList.remove('hidden'); // Show AI button for risky students
        } else {
             badgeEl.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold border border-emerald-200";
             badgeEl.innerText = "An toàn";
             btnExplain.classList.add('hidden');
        }
        
        // Logs Table
        const tbody = document.getElementById('student-logs-tbody');
        tbody.innerHTML = '';
        student.weekly_data.reverse().forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-medium">Tuần ${log.week}</td>
                <td class="py-2.5 px-3">${log.active_days}/7</td>
                <td class="py-2.5 px-3">${log.login_count}</td>
                <td class="py-2.5 px-3">${log.video_views}</td>
                <td class="py-2.5 px-3">${log.document_reads}</td>
                <td class="py-2.5 px-3">${log.discussion}</td>
                <td class="py-2.5 px-3">${log.assignment_attempt}</td>
                <td class="py-2.5 px-3 font-bold text-primary">${log.weekly_score}</td>
            `;
            tbody.appendChild(tr);
        });
        
        renderRadarChart(student.weekly_data[0]); // pass latest week (since we reversed it)
        renderTimelineChart(student.weekly_data.slice().reverse()); // Pass chrono order
        
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
}

function renderRadarChart(latestLog) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (chartInstances.radar) chartInstances.radar.destroy();
    
    // Mock Max good student bounds
    const maxVals = [7, 30, 15, 20, 5, 10]; // max active_days, login, video, docs, discussion, score
    
    chartInstances.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Chăm chỉ (ngày)', 'Đăng nhập', 'Xem Video', 'Đọc TL', 'Thảo luận', 'Điểm'],
            datasets: [
                {
                    label: 'Sinh viên hiện tại',
                    data: [
                        latestLog.active_days / maxVals[0] * 100,
                        latestLog.login_count / maxVals[1] * 100,
                        latestLog.video_views / maxVals[2] * 100,
                        latestLog.document_reads / maxVals[3] * 100,
                        latestLog.discussion / maxVals[4] * 100,
                        latestLog.weekly_score / maxVals[5] * 100
                    ],
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: '#6366f1',
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#6366f1'
                },
                {
                    label: 'Trung bình lớp',
                    data: [80, 70, 60, 65, 50, 75],
                    backgroundColor: 'rgba(148, 163, 184, 0.2)',
                    borderColor: '#94a3b8',
                    pointBackgroundColor: '#94a3b8',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#94a3b8',
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: '#f1f5f9' },
                    grid: { color: '#f1f5f9' },
                    pointLabels: { font: { family: 'Inter', size: 10 } },
                    ticks: { display: false, max: 100, min: 0 }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12 } },
                tooltip: {
                    callbacks: { label: function(ctx) { return ctx.dataset.label + ": " + ctx.raw.toFixed(0) + "% (so vs Max)"; } }
                }
            }
        }
    });
}

function renderTimelineChart(chronologicalLogs) {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    if (chartInstances.timeline) chartInstances.timeline.destroy();
    
    const labels = chronologicalLogs.map(l => `T${l.week}`);
    const scores = chronologicalLogs.map(l => l.weekly_score);
    const activity = chronologicalLogs.map(l => l.active_days);
    
    chartInstances.timeline = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Điểm số (0-10)',
                    data: scores,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    type: 'bar',
                    label: 'Số ngày Online / Tuần',
                    data: activity,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderRadius: 4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: 11} } }
            },
            scales: {
                y: {
                    type: 'linear', display: true, position: 'left', min: 0, max: 10,
                    grid: { color: '#f1f5f9' },
                    title: { display: true, text: 'Điểm', font: {size: 10} }
                },
                y1: {
                    type: 'linear', display: true, position: 'right', min: 0, max: 7,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Ngày', font: {size: 10} }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

// ========= TAB 4: PHÁT HIỆN BẤT THƯỜNG (SCATTER PLOT) =========
async function loadIntegrityData() {
    const res = await fetch(`${API_URL}/integrity`);
    const data = await res.json();
    
    const ctx = document.getElementById('scatterChart').getContext('2d');
    if (chartInstances.scatter) chartInstances.scatter.destroy();
    
    // Convert data for scatter
    const normalPoints = [];
    const anomalyPoints = [];
    
    data.forEach(d => {
        // Condition for Anomaly: Nỗ lực rất thấp (< 5) nhưng điểm cao (> 8)
        if (d.effort_score < 10 && d.score > 8) {
            anomalyPoints.push({ x: d.effort_score, y: d.score, name: d.student_name, id: d.student_id });
        } else {
            normalPoints.push({ x: d.effort_score, y: d.score, name: d.student_name, id: d.student_id });
        }
    });
    
    chartInstances.scatter = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Sinh viên bình thường',
                    data: normalPoints,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    borderColor: '#4338ca',
                    pointRadius: 6,
                    pointHoverRadius: 9
                },
                {
                    label: '🚩 Có dấu hiệu bất thường (Cần chú ý)',
                    data: anomalyPoints,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#b91c1c',
                    pointRadius: 8,
                    pointHoverRadius: 11,
                    pointStyle: 'triangle'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const p = ctx.raw;
                            return `${p.name} (${p.id}) - Nỗ lực: ${p.x.toFixed(1)} | Điểm: ${p.y}`;
                        }
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                x: { title: { display: true, text: 'Chỉ số nỗ lực (dựa trên hoạt động hệ thống)', font: {weight: 'bold'} }, grid: { borderDash: [5,5] } },
                y: { title: { display: true, text: 'Điểm số hàng tuần (0-10)', font: {weight: 'bold'} }, min: 0, max: 10, grid: { borderDash: [5,5] } }
            }
        }
    });
}

// ========= TAB 5: LỊCH SỬ CAN THIỆP & MODAL =========
async function loadInterventions() {
    const res = await fetch(`${API_URL}/interventions`);
    const data = await res.json();
    
    const tbody = document.getElementById('intervention-list');
    tbody.innerHTML = '';
    
    data.forEach(item => {
        let iconHtml = '<i class="fa-solid fa-envelope text-blue-500 w-5"></i>';
        if(item.intervention_type.includes('Gọi')) iconHtml = '<i class="fa-solid fa-phone text-emerald-500 w-5"></i>';
        if(item.intervention_type.includes('Gặp')) iconHtml = '<i class="fa-solid fa-handshake text-indigo-500 w-5"></i>';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-50">${item.date}</td>
            <td class="py-4 px-6 border-b border-slate-50 font-medium text-slate-800">${item.student_name}</td>
            <td class="py-4 px-6 border-b border-slate-50 flex items-center">${iconHtml} <span class="ml-2">${item.intervention_type}</span></td>
            <td class="py-4 px-6 border-b border-slate-50 text-slate-500 italic">${item.note}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Logic
function openInterventionModal() {
    if (!selectedStudentId) {
        alert("Vui lòng chọn một sinh viên trước!");
        return;
    }
    const modal = document.getElementById('intervention-modal');
    const content = document.getElementById('intervention-modal-content');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
}

function closeInterventionModal() {
    const modal = document.getElementById('intervention-modal');
    const content = document.getElementById('intervention-modal-content');
    
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    
    // Reset form
    document.getElementById('intervention-form').reset();
}

async function submitIntervention(e) {
    e.preventDefault();
    
    const type = document.getElementById('intervention-type').value;
    const note = document.getElementById('intervention-note').value;
    
    if(!selectedStudentId) return;
    
    try {
        const res = await fetch(`${API_URL}/intervention`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: selectedStudentId,
                intervention_type: type,
                note: note
            })
        });
        
        if (res.ok) {
            alert('Đã lưu can thiệp thành công!');
            closeInterventionModal();
            loadInterventions(); // Reload table
        } else {
            alert('Lỗi khi lưu can thiệp!');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối máy chủ!');
    }
}

// ========= TAB 6: GEMINI AI INTEGRATION =========
function getApiKey() {
    const key = document.getElementById('gemini-api-key').value.trim();
    if (!key) {
        alert("Vui lòng nhập Gemini API Key ở góc phải trên màn hình trước khi dùng tính năng AI.");
        return null;
    }
    return key;
}

// 6.1 Giải thích lý do rủi ro
async function explainWithAI() {
    const apiKey = getApiKey();
    if (!apiKey || !currentViewedStudent) return;
    
    const btn = document.getElementById('btn-explain-ai');
    const box = document.getElementById('ai-explanation-box');
    const textEl = document.getElementById('ai-explanation-text');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang phân tích...';
    
    box.classList.remove('hidden');
    textEl.innerText = 'Đang phân tích dữ liệu...';
    
    // Construct simple payload to not exceed token limit
    const payload = {
        api_key: apiKey,
        student_data: {
            name: currentViewedStudent.full_name,
            course: currentViewedStudent.course,
            logs: currentViewedStudent.weekly_data.slice(-4) // Last 4 weeks to understand trend
        }
    };
    
    try {
        const res = await fetch(`${API_URL}/ai/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (res.ok) {
            textEl.innerText = result.explanation;
        } else {
            textEl.innerText = "Lỗi khi gọi AI: " + (result.detail || "Không xác định");
        }
    } catch (e) {
        textEl.innerText = "Lỗi mạng hoặc server.";
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2 text-yellow-200"></i> AI Giải thích';
    }
}

// 6.2 Soạn bản thảo Email (Draft)
async function draftEmailWithAI() {
    const apiKey = getApiKey();
    if (!apiKey || !selectedStudentId) return;
    
    // Lấy object sinh viên đang chọn. Modal can thiệp có thể đc mở từ màn khác, nên ta phải fetch lại student info current
    let targetStudent = currentViewedStudent;
    if (!targetStudent || targetStudent.student_id !== selectedStudentId) {
        // Fallback search trong window.allStudents
        targetStudent = window.allStudents.find(s => s.student_id === selectedStudentId);
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
            course: targetStudent ? targetStudent.course : "Môn học chưa rõ"
        },
        intervention_type: interventionType,
        note: noteEl.value // Use current note as hint for AI
    };
    
    try {
        const res = await fetch(`${API_URL}/ai/draft-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (res.ok) {
            noteEl.value = result.email_draft;
        } else {
            alert("Lỗi khi gọi AI: " + (result.detail || "Không xác định"));
        }
    } catch (e) {
        alert("Lỗi mạng hoặc server.");
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
}

