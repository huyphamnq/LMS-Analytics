// Utility function to format minutes into human readable string
function formatTime(minutes) {
    if (minutes === undefined || minutes === null) return '--';
    if (minutes === 0) return '0p';
    const absMins = Math.abs(minutes);
    if (absMins < 60) return `${absMins}p`;
    const hours = Math.floor(absMins / 60);
    const mins = absMins % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    }
    return mins > 0 ? `${hours}h ${mins}p` : `${hours}h`;
}

window.loadStudentList = async function () {
    console.log("Loading student list...");
    const listEl = document.getElementById('full-student-list');
    if (!listEl) return;

    // Show loading
    listEl.innerHTML = '<div class="p-8 text-center"><div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-indigo-600"></div></div>';

    try {
        const riskStatus = document.getElementById('filter-risk-status')?.value || 'all';
        const minRiskVal = document.getElementById('filter-risk-slider')?.value || 0;

        // Build query - Sync with global filters
        const params = new URLSearchParams();
        const course = document.getElementById('filter-course')?.value || '';
        const className = document.getElementById('filter-class')?.value || '';

        if (course) params.append('course', course);
        if (className) params.append('class_name', className);
        if (riskStatus !== 'all') params.append('risk_label', riskStatus);

        // Add risk probability percentage filters from slider
        if (minRiskVal > 0) {
            params.append('min_risk', (minRiskVal / 100).toString());
        }

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

        // Badge can thiệp
        const hasIntervention = s.has_intervention || false;
        const invCount = s.intervention_count || 0;
        const invBadgeHtml = hasIntervention
            ? `<span class="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200" title="Đã có ${invCount} lần can thiệp">
                <i class="fa-solid fa-handshake text-[7px]"></i>${invCount}
               </span>`
            : `<span class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400" title="Chưa có can thiệp">
                <i class="fa-regular fa-clock text-[7px]"></i>
               </span>`;

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
                    <div class="flex items-center gap-1.5 mt-0.5">
                        <p class="text-[10px] text-slate-500 font-medium">${s.student_id} • ${s.class_name || ''}</p>
                        ${invBadgeHtml}
                    </div>
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
        const latestPred = predictions.length > 0 ? predictions[0] : null;

        window.currentViewedStudent = student; // Cache for AI
        window.currentLatestPrediction = latestPred; // Cache prediction for AI

        // Ưu tiên threshold của dự đoán mới nhất để đồng bộ với model thực tế.
        let riskThreshold = 50; // fallback
        if (latestPred && latestPred.threshold !== undefined && latestPred.threshold !== null) {
            riskThreshold = Number(latestPred.threshold) * 100;
        }

        // Update header
        document.getElementById('detail-name').innerText = student.full_name;
        document.getElementById('detail-id').innerText = `${student.student_id} • Lớp: ${student.class_name || 'N/A'} • Môn: ${student.course_name || 'N/A'}`;

        // Hide AI box manually first
        document.getElementById('ai-explanation-box').classList.add('hidden');
        document.getElementById('ai-explanation-text').innerText = 'Đang phân tích dữ liệu...';

        // Badge
        const badgeEl = document.getElementById('detail-badge');
        const btnExplain = document.getElementById('btn-explain-ai');
        const invStatusEl = document.getElementById('detail-intervention-status');

        btnExplain.classList.remove('hidden'); // Show AI button for ALL students

        // Hiển thị badge can thiệp (sử dụng data từ interventions trong response)
        const interventionsList = data.interventions || [];
        const hasIntervention = interventionsList.length > 0;
        if (invStatusEl) {
            if (hasIntervention) {
                invStatusEl.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                        <i class="fa-solid fa-handshake text-blue-500"></i>
                        Đã can thiệp (${interventionsList.length} lần)
                    </span>`;
            } else {
                invStatusEl.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                        <i class="fa-regular fa-clock text-amber-500"></i>
                        Chưa can thiệp
                    </span>`;
            }
        }

        if (latestPred && latestPred.risk_label === "Nguy cơ") {
            badgeEl.className = "px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold border border-red-200";
            badgeEl.innerText = `Nguy cơ (${(latestPred.risk_probability * 100).toFixed(0)}%)`;
        } else if (latestPred && latestPred.risk_label === "An toàn") {
            badgeEl.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold border border-emerald-200";
            badgeEl.innerText = `An toàn (${(latestPred.risk_probability * 100).toFixed(0)}%)`;
        } else if (latestPred) {
            badgeEl.className = "px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold border border-amber-200";
            badgeEl.innerText = latestPred.risk_label || "Lỗi dự đoán";
        } else {
            badgeEl.className = "px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold border border-slate-200";
            badgeEl.innerText = "Chưa có dự đoán";
        }

        // Update behavioral stats grid (dùng tuần mới nhất)
        // weekly_data trong DB không đảm bảo thứ tự, cần tìm tuần lớn nhất
        const latestWeek = (student.weekly_data && student.weekly_data.length > 0)
            ? student.weekly_data.reduce((prev, curr) => (curr.week > prev.week ? curr : prev), student.weekly_data[0])
            : null;
        if (latestWeek) {
            document.getElementById('stat-session-time').innerText = formatTime(latestWeek.session_duration);
            document.getElementById('stat-last-login').innerText = latestWeek.days_since_last_login !== undefined ? latestWeek.days_since_last_login : '--';
            document.getElementById('stat-assignment-time').innerText = formatTime(latestWeek.assignment_duration_mins);

            const ontime = latestWeek.ontime_margin || 0;
            document.getElementById('stat-ontime-margin').innerText = formatTime(Math.abs(ontime));
            document.getElementById('stat-ontime-label').innerText = ontime >= 0 ? 'sớm' : 'trễ';
            document.getElementById('stat-ontime-label').className = `text-[10px] font-medium ${ontime >= 0 ? 'text-emerald-500' : 'text-risk'}`;
        } else {
            // Không có weekly_data → reset stats về mặc định
            document.getElementById('stat-session-time').innerText = '--';
            document.getElementById('stat-last-login').innerText = '--';
            document.getElementById('stat-assignment-time').innerText = '--';
            document.getElementById('stat-ontime-margin').innerText = '--';
            document.getElementById('stat-ontime-label').innerText = '';
        }

        // Logs Table - sắp xếp theo tuần tăng dần
        const tbody = document.getElementById('student-logs-tbody');
        tbody.innerHTML = '';
        const weeklyData = student.weekly_data || [];
        if (weeklyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400 text-sm italic">Chưa có dữ liệu hành vi tuần</td></tr>';
        }
        const sortedLogs = weeklyData.slice().sort((a, b) => a.week - b.week);
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
                    ontimeHtml = `<span class="inline-flex items-center gap-0.5 text-emerald-600 font-bold"><i class="fa-solid fa-arrow-up text-[9px]"></i>Sớm ${formatTime(Math.abs(ontime))}</span>`;
                } else if (ontime < 0) {
                    ontimeHtml = `<span class="inline-flex items-center gap-0.5 text-red-500 font-bold"><i class="fa-solid fa-arrow-down text-[9px]"></i>Trễ ${formatTime(Math.abs(ontime))}</span>`;
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
                <td class="py-3 px-2 text-left">
                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0"></span>
                        <span class="font-semibold text-slate-700 text-xs">T${log.week}</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-semibold">
                        ${log.video_views || 0}
                    </span>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-semibold">
                        ${log.document_reads || 0}
                    </span>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded text-[10px] font-semibold">
                        ${log.discussion || 0}
                    </span>
                </td>
                <td class="py-3 px-2">
                    <div class="flex items-center gap-1.5">
                        <div class="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full ${barColor}" style="width:${activePct}%"></div>
                        </div>
                        <span class="text-[10px] text-slate-500 font-medium">${activeDays}/7</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="font-semibold text-indigo-600 text-xs">${logins}</span>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="text-slate-700 text-xs font-medium">${formatTime(log.session_duration)}</span>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="text-slate-600 text-xs font-medium">${formatTime(log.assignment_duration_mins)}</span>
                </td>
                <td class="py-3 px-2 text-center">${ontimeHtml}</td>
                <td class="py-3 px-2 text-center">${lastLoginHtml}</td>
                <td class="py-3 px-2 text-center">${scoreHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        // Sắp xếp weekly_data theo tuần tăng dần cho biểu đồ
        const sortedByWeek = (student.weekly_data || []).slice().sort((a, b) => a.week - b.week);

        // Lấy tuần mới nhất cho Radar Chart
        const latestWeekForRadar = sortedByWeek.length > 0 ? sortedByWeek[sortedByWeek.length - 1] : null;

        if (latestWeekForRadar) {
            renderRadarChart(latestWeekForRadar);
        }
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
        type: 'bar',
        data: {
            labels: ['Chăm chỉ', 'Đăng nhập', 'Xem Video', 'Đọc TL', 'Thảo luận', 'Làm bài'],
            datasets: [
                {
                    label: 'Sinh viên',
                    data: normStu,
                    backgroundColor: 'rgba(99, 102, 241, 0.85)',
                    borderColor: '#4f46e5',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Nhóm giỏi',
                    data: normTop,
                    backgroundColor: 'rgba(16, 185, 129, 0.85)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    min: 0,
                    max: 10,
                    grid: { color: '#f1f5f9' },
                    title: { display: true, text: 'Điểm chuẩn hóa (0-10)', font: { size: 10, family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#475569' }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11, family: 'Inter' } } },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
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
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Điểm số (0-10)',
                    data: scores,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    tension: 0.3,
                    spanGaps: true,
                    fill: true
                },
                {
                    label: 'Ngày HĐ (0-7)',
                    data: activity,
                    borderColor: '#6366f1',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, family: 'Inter' } } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + (context.datasetIndex === 1 ? ' ngày' : ' điểm');
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 0,
                    max: 10,
                    grid: { color: '#f1f5f9' },
                    ticks: { font: { family: 'Inter', size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
}
