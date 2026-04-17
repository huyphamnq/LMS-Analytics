window.loadStudentList = async function() {
    console.log("Loading student list...");
    const listEl = document.getElementById('full-student-list');
    if (!listEl) return;
    
    // Show loading
    listEl.innerHTML = '<div class="p-8 text-center"><div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-indigo-600"></div></div>';
    
    try {
        const riskStatus = document.getElementById('filter-risk-status')?.value || 'all';
        
        // Build query - Sync with global filters
        const params = new URLSearchParams();
        const course = document.getElementById('filter-course')?.value || '';
        const className = document.getElementById('filter-class')?.value || '';
        
        if (course) params.append('course', course);
        if (className) params.append('class_name', className);
        if (riskStatus !== 'all') params.append('risk_label', riskStatus);
        
        const queryString = params.toString() ? `?${params.toString()}` : '';
        console.log("Fetching students with query:", queryString);
        
        const res = await apiFetch(`/students${queryString}`);
        if (!res) {
            console.error("Failed to fetch students: res is null");
            listEl.innerHTML = '<div class="p-8 text-center text-red-500">Lỗi kết nối máy chủ</div>';
            return;
        }
        
        const data = await res.json();
        console.log(`Loaded ${data.length} students`);
        
        window.allStudents = data; // cache for search
        renderStudentList(data);
        
        // Re-setup search listener
        const searchInput = document.getElementById('search-student');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = window.allStudents.filter(s => 
                    s.full_name.toLowerCase().includes(term) || s.student_id.toLowerCase().includes(term)
                );
                renderStudentList(filtered);
            };
        }
    } catch (err) {
        console.error("Error in loadStudentList:", err);
        listEl.innerHTML = '<div class="p-8 text-center text-red-500">Đã xảy ra lỗi khi tải dữ liệu</div>';
    }
}

// Initial alias for back-compatibility if needed
const loadStudentList = window.loadStudentList;


function renderStudentList(students) {
    const listEl = document.getElementById('full-student-list');
    listEl.innerHTML = '';
    
    if (students.length === 0) {
        listEl.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm italic">Không tìm thấy sinh viên nào</div>';
        return;
    }

    students.forEach(s => {
        const div = document.createElement('div');
        div.className = "p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer rounded-xl transition-all flex justify-between items-center group mb-1";
        if (window.selectedStudentId === s.student_id) {
            div.classList.add('bg-indigo-50', 'border-indigo-100');
        }
        
        div.onclick = () => {
            // Highlight selected
            document.querySelectorAll('.student-list-item-active').forEach(el => el.classList.remove('bg-indigo-50', 'border-indigo-100', 'student-list-item-active'));
            div.classList.add('bg-indigo-50', 'border-indigo-100', 'student-list-item-active');
            viewStudentDetail(s.student_id, s.course_name);
        };
        
        const latestPred = s.latest_prediction;
        let statusBadge = '';
        if (latestPred) {
            const riskColor = latestPred.risk_label === "Nguy cơ" ? "bg-red-500" : "bg-emerald-500";
            statusBadge = `<div class="w-2 h-2 rounded-full ${riskColor} shadow-sm" title="${latestPred.risk_label}"></div>`;
        }

        div.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="relative">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random&size=128" class="w-10 h-10 rounded-full border-2 border-white shadow-sm">
                    <div class="absolute -bottom-0.5 -right-0.5 border-2 border-white rounded-full">
                        ${statusBadge}
                    </div>
                </div>
                <div>
                    <h5 class="text-sm font-bold text-slate-800 line-clamp-1">${s.full_name}</h5>
                    <p class="text-[10px] text-slate-500 font-medium">${s.student_id} • ${s.class_name || ''}</p>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-300 text-[10px] group-hover:text-primary transition-colors"></i>
        `;
        listEl.appendChild(div);
    });
}


async function viewStudentDetail(studentId, courseName) {
    if (typeof showLoading === 'function') showLoading(true);
    window.selectedStudentId = studentId;
    window.selectedCourseName = courseName;
    
    // UI updates
    switchTab('student-analysis');
    document.getElementById('empty-student-state').classList.add('hidden');
    document.getElementById('student-content').classList.remove('hidden');
    
    try {
        let url = `/students/${studentId}`;
        if (courseName) {
            url += `?course_name=${encodeURIComponent(courseName)}`;
        }
        const res = await apiFetch(url);
        if (!res) return;
        const data = await res.json();
        const student = data.profile;
        const predictions = data.predictions;
        
        window.currentViewedStudent = student; // Cache for AI
        
        // Lấy threshold từ API sớm để có thể dùng trong bảng logs và biểu đồ
        let riskThreshold = 50; // fallback
        try {
            const metricsRes = await apiFetch('/ml/metrics');
            if (metricsRes && metricsRes.ok) {
                const metricsData = await metricsRes.json();
                if (metricsData && metricsData[0] && metricsData[0].threshold !== undefined) {
                    riskThreshold = metricsData[0].threshold * 100; // convert 0-1 to 0-100
                }
            }
        } catch (_) { /* giữ fallback 50 nếu lỗi */ }
        
        // Update header
        document.getElementById('detail-name').innerText = student.full_name;
        document.getElementById('detail-id').innerText = `${student.student_id} • Lớp: ${student.class_name || 'N/A'} • Môn: ${student.course_name || 'N/A'}`;
        
        // Hide AI box manually first
        document.getElementById('ai-explanation-box').classList.add('hidden');
        document.getElementById('ai-explanation-text').innerText = 'Đang phân tích dữ liệu...';
        
        // Badge
        const latestPred = predictions.length > 0 ? predictions[0] : null;
        const badgeEl = document.getElementById('detail-badge');
        const btnExplain = document.getElementById('btn-explain-ai');
        
        btnExplain.classList.remove('hidden'); // Show AI button for ALL students
        
        if (latestPred && latestPred.risk_label === "Nguy cơ") {
             badgeEl.className = "px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold border border-red-200";
             badgeEl.innerText = `Nguy cơ (${(latestPred.risk_probability*100).toFixed(0)}%)`;
        } else if (latestPred) {
             badgeEl.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold border border-emerald-200";
             badgeEl.innerText = `An toàn (${(latestPred.risk_probability*100).toFixed(0)}%)`;
        } else {
             badgeEl.className = "px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold border border-slate-200";
             badgeEl.innerText = "Chưa có dự đoán";
        }
        
        // Update behavioral stats grid (dùng tuần mới nhất)
        // weekly_data trong DB không đảm bảo thứ tự, cần tìm tuần lớn nhất
        const latestWeek = student.weekly_data.reduce((prev, curr) => 
            (curr.week > prev.week ? curr : prev), student.weekly_data[0]);
        if (latestWeek) {
            document.getElementById('stat-session-time').innerText = latestWeek.session_duration || 0;
            document.getElementById('stat-last-login').innerText = latestWeek.days_since_last_login !== undefined ? latestWeek.days_since_last_login : '--';
            document.getElementById('stat-assignment-time').innerText = latestWeek.assignment_duration_mins || 0;
            
            const ontime = latestWeek.ontime_margin || 0;
            document.getElementById('stat-ontime-margin').innerText = Math.abs(ontime);
            document.getElementById('stat-ontime-label').innerText = ontime >= 0 ? 'sớm' : 'trễ';
            document.getElementById('stat-ontime-label').className = `text-[10px] font-medium ${ontime >= 0 ? 'text-emerald-500' : 'text-risk'}`;
        }
        
        // Logs Table - sắp xếp theo tuần tăng dần
        const tbody = document.getElementById('student-logs-tbody');
        tbody.innerHTML = '';
        const sortedLogs = student.weekly_data.slice().sort((a, b) => a.week - b.week);
        sortedLogs.forEach(log => {
            const activeDays = log.active_days !== undefined ? log.active_days : 0;
            const maxDays = 7;
            const activePct = Math.min((activeDays / maxDays) * 100, 100);
            const logins = log.login_count !== undefined ? log.login_count : (log.online_count || 0);
            const lastLogin = log.days_since_last_login !== undefined ? log.days_since_last_login : null;
            const ontime = log.ontime_margin !== undefined ? log.ontime_margin : null;
            const score = log.weekly_score !== undefined ? log.weekly_score : null;

            // Active days bar
            const barColor = activePct >= 70 ? 'bg-emerald-400' : activePct >= 40 ? 'bg-amber-400' : 'bg-red-400';

            // Ontime styling
            let ontimeHtml = '<span class="text-slate-300">—</span>';
            if (ontime !== null) {
                if (ontime > 0) {
                    ontimeHtml = `<span class="inline-flex items-center gap-0.5 text-emerald-600 font-bold"><i class="fa-solid fa-arrow-up text-[9px]"></i>+${ontime}m</span>`;
                } else if (ontime < 0) {
                    ontimeHtml = `<span class="inline-flex items-center gap-0.5 text-red-500 font-bold"><i class="fa-solid fa-arrow-down text-[9px]"></i>${ontime}m</span>`;
                } else {
                    ontimeHtml = `<span class="text-slate-500 font-medium">Đúng giờ</span>`;
                }
            }

            // Score badge
            let scoreHtml = '<span class="text-slate-300">—</span>';
            if (score !== null) {
                const scoreColor = score >= 8 ? 'bg-emerald-100 text-emerald-700' : score >= 6 ? 'bg-blue-100 text-blue-700' : score >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                scoreHtml = `<span class="px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor}">${score}</span>`;
            }

            // Last login
            let lastLoginHtml = '<span class="text-slate-300">—</span>';
            if (lastLogin !== null) {
                const loginColor = lastLogin <= 2 ? 'text-emerald-600' : lastLogin <= 5 ? 'text-amber-600' : 'text-red-500';
                lastLoginHtml = `<span class="${loginColor} font-medium">${lastLogin}d</span>`;
            }

            const tr = document.createElement('tr');
            tr.className = `border-b border-slate-100 hover:bg-slate-50/80 transition-colors`;
            tr.innerHTML = `
                <td class="py-3 px-3 text-left">
                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0"></span>
                        <span class="font-semibold text-slate-700 text-xs">T${log.week}</span>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="flex items-center gap-1">
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-semibold" title="Video views">
                            <i class="fa-solid fa-play text-[8px]"></i>${log.video_views || 0}
                        </span>
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-semibold" title="Tài liệu">
                            <i class="fa-solid fa-file-lines text-[8px]"></i>${log.document_reads || 0}
                        </span>
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded text-[10px] font-semibold" title="Thảo luận">
                            <i class="fa-solid fa-comments text-[8px]"></i>${log.discussion || 0}
                        </span>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="flex items-center gap-1.5">
                        <div class="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full ${barColor}" style="width:${activePct}%"></div>
                        </div>
                        <span class="text-[10px] text-slate-500 font-medium">${activeDays}/7</span>
                    </div>
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="font-semibold text-indigo-600 text-xs">${logins}</span>
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="text-slate-700 text-xs font-medium">${log.session_duration || 0}<span class="text-slate-400 font-normal">m</span></span>
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="text-slate-600 text-xs">${log.assignment_duration_mins || 0}<span class="text-slate-400">m</span></span>
                </td>
                <td class="py-3 px-3 text-center">${ontimeHtml}</td>
                <td class="py-3 px-3 text-center">${lastLoginHtml}</td>
                <td class="py-3 px-3 text-center">${scoreHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        
        // Sắp xếp weekly_data theo tuần tăng dần cho biểu đồ
        const sortedByWeek = student.weekly_data.slice().sort((a, b) => a.week - b.week);
        
        // Lấy tuần mới nhất cho Radar Chart
        const latestWeekForRadar = sortedByWeek[sortedByWeek.length - 1];
        
        renderRadarChart(latestWeekForRadar);
        renderTimelineChart(sortedByWeek, predictions, riskThreshold);

        
    } catch (e) {
        console.error(e);
    } finally {
        if (typeof showLoading === 'function') showLoading(false);
    }
}

function renderRadarChart(latestLog) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (window.chartInstances.radar) window.chartInstances.radar.destroy();
    
    // 6 đại diện từ 9 metrics hành vi của model (weekly_score là label, không phải feature)
    // Giá trị max để chuẩn hóa về thang 10 điểm:
    // active_days(7), login_count(20), video_views(15), document_reads(20), discussion(5), assignment_duration_mins(120)
    const maxVals = [7, 20, 15, 20, 5, 120]; 
    
    const rawStu = [
        latestLog.active_days || 0,
        latestLog.login_count || latestLog.online_count || 0,
        latestLog.video_views || 0,
        latestLog.document_reads || 0,
        latestLog.discussion || 0,
        latestLog.assignment_duration_mins || 0
    ];
    
    const normStu = rawStu.map((v, i) => Math.min((v / maxVals[i]) * 10, 10));
    
    // Nhóm giỏi benchmark (Top students) — chuẩn hóa 0-10
    const normTop = [8.5, 8.0, 7.5, 8.0, 6.0, 7.5];
    
    window.chartInstances.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Chăm chỉ', 'Đăng nhập', 'Xem Video', 'Đọc TL', 'Thảo luận', 'Làm bài'],
            datasets: [
                {
                    label: 'Sinh viên',
                    data: normStu,
                    backgroundColor: 'rgba(99, 102, 241, 0.4)',
                    borderColor: '#4f46e5',
                    borderWidth: 2,
                    pointBackgroundColor: '#4f46e5',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#4f46e5'
                },
                {
                    label: 'Nhóm giỏi',
                    data: normTop,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#10b981',
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: '#e2e8f0' },
                    grid: { color: '#e2e8f0', circular: true },
                    pointLabels: { font: { family: 'Inter', size: 11, weight: '600' }, color: '#475569' },
                    ticks: { display: false, max: 10, min: 0, stepSize: 2 }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: {size: 12} } },
                tooltip: {
                    callbacks: { 
                        label: function(ctx) { 
                            let valStr = ctx.raw.toFixed(1) + "/10";
                            if (ctx.datasetIndex === 0) {
                                valStr += ` (Thực tế: ${rawStu[ctx.dataIndex]})`;
                            }
                            return ctx.dataset.label + ": " + valStr;
                        } 
                    }
                }
            }
        }
    });
}

function renderTimelineChart(chronologicalLogs, predictions = [], riskThreshold = 50) {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    if (window.chartInstances.timeline) window.chartInstances.timeline.destroy();
    
    const labels = chronologicalLogs.map(l => `T${l.week}`);
    // weekly_score có thể là 0 hợp lệ, dùng null nếu không có để Chart.js bỏ qua
    const scores = chronologicalLogs.map(l => l.weekly_score !== undefined ? l.weekly_score : null);
    const activity = chronologicalLogs.map(l => l.active_days !== undefined ? l.active_days : (l.login_count || l.online_count || 0));
    
    window.chartInstances.timeline = new Chart(ctx, {
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
                    spanGaps: true,
                    yAxisID: 'y'
                },
                {
                    type: 'bar',
                    label: 'Số ngày Online/Tuần',
                    data: activity,
                    backgroundColor: 'rgba(99, 102, 241, 0.3)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
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
                    title: { display: true, text: 'Ngày/Tuần', font: {size: 10} }
                }
            }
        }
    });
}
