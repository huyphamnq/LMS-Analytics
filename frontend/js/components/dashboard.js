async function loadSummary() {
    
    const course = document.getElementById('filter-course')?.value || '';
    const className = document.getElementById('filter-class')?.value || '';
    const query = new URLSearchParams();
    if (course) query.append('course', course);
    if (className) query.append('class_name', className);
    
    const res = await apiFetch(`/dashboard/summary?${query.toString()}`);
    if (!res) return;
    const data = await res.json();
    
    document.getElementById('stat-total').innerText = data.total_students;
    document.getElementById('stat-safe').innerText = data.safe_students;
    document.getElementById('stat-risk').innerText = data.risk_students;
    document.getElementById('stat-percent').innerText = `${data.risk_percentage}%`;
    
    renderPieChart(data.safe_students, data.risk_students);
    await loadTrendChart();
}

function renderPieChart(safe, risk) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    if (window.chartInstances.pie) window.chartInstances.pie.destroy();
    
    window.chartInstances.pie = new Chart(ctx, {
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

async function loadTrendChart() {
    const course = document.getElementById('filter-course')?.value || '';
    const className = document.getElementById('filter-class')?.value || '';
    const query = new URLSearchParams();
    if (course) query.append('course', course);
    if (className) query.append('class_name', className);

    const res = await apiFetch(`/dashboard/trend?${query.toString()}`);
    if (!res) return;
    
    const data = await res.json();
    const weeks = data.weeks;
    const riskTrend = data.trend;

    
    const ctx = document.getElementById('lineChart').getContext('2d');
    if (window.chartInstances.line) window.chartInstances.line.destroy();
    
    window.chartInstances.line = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [{
                label: 'Điểm nỗ lực (1-10)',
                data: riskTrend,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#10b981',
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
                    max: 10,
                    grid: { borderDash: [5, 5], color: '#f1f5f9' },
                    ticks: { callback: function(value) { return value + " đ" } }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function closeRiskListModal() {
    const modal = document.getElementById('risk-list-modal');
    const content = document.getElementById('risk-list-modal-content');
    
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
    
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
}

async function openRiskListModal(label) {
    const modal = document.getElementById('risk-list-modal');
    const content = document.getElementById('risk-list-modal-content');
    const title = document.getElementById('risk-list-modal-title');
    const tbody = document.getElementById('risk-list-modal-tbody');
    const loading = document.getElementById('risk-list-loading');
    
    title.innerText = `Danh sách sinh viên (${label})`;
    tbody.innerHTML = '';
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
    
    loading.classList.remove('hidden');
    
    const course = document.getElementById('filter-course')?.value || '';
    const className = document.getElementById('filter-class')?.value || '';
    const query = new URLSearchParams({ risk_label: label });
    if (course) query.append('course', course);
    if (className) query.append('class_name', className);
    
    const res = await apiFetch(`/dashboard/students_by_risk?${query.toString()}`);
    loading.classList.add('hidden');
    
    if (!res) return;
    const students = await res.json();
    
    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">Không có sinh viên nào trong nhóm này.</td></tr>`;
        return;
    }
    
    students.forEach(student => {
        let probBadge = '';
        if (student.risk_probability < 0.5) {
            probBadge = `<span class="bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-md text-xs">${Math.round(student.risk_probability * 100)}%</span>`;
        } else if (student.risk_probability < 0.7) {
            probBadge = `<span class="bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-md text-xs">${Math.round(student.risk_probability * 100)}%</span>`;
        } else {
            probBadge = `<span class="bg-rose-100 text-rose-700 font-semibold px-2 py-1 rounded-md text-xs">${Math.round(student.risk_probability * 100)}%</span>`;
        }
        
        let effortBadge = '';
        // effort_score thang 1-10 (theo calculate_effort_score trong ml_service.py)
        if (student.effort_score >= 7) {
            effortBadge = `<span class="text-emerald-600 font-semibold">${student.effort_score}</span>`;
        } else if (student.effort_score >= 4) {
            effortBadge = `<span class="text-amber-600 font-semibold">${student.effort_score}</span>`;
        } else {
            effortBadge = `<span class="text-rose-600 font-semibold">${student.effort_score} <i class="fa-solid fa-arrow-down text-[10px]"></i></span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-indigo-50/50 transition-colors text-sm text-slate-700 cursor-pointer';
        tr.onclick = () => {
            closeRiskListModal();
            if (typeof viewStudentDetail === 'function') {
                viewStudentDetail(student.student_id, student.course_name);
            }
        };
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium text-slate-800">${student.student_id}</td>
            <td class="py-3 px-4 font-semibold">${student.student_name}</td>
            <td class="py-3 px-4">${student.class_name}</td>
            <td class="py-3 px-4">${probBadge}</td>
            <td class="py-3 px-4">${effortBadge}</td>
            <td class="py-3 px-4 text-right">
                <i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

