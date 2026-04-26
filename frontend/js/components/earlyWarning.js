async function loadEarlyWarning() {
    const res = await apiFetch('/early-warning');
    if (!res) return;
    const data = await res.json();

    const tbody = document.getElementById('warning-list');
    tbody.innerHTML = '';

    // Sort by prob high to low
    data.sort((a, b) => b.risk_probability - a.risk_probability);

    data.forEach(item => {
        const probClass = item.risk_probability > 0.8 ? 'text-red-600 font-bold' : 'text-red-500 font-medium';
        
        // Badge can thiệp
        const hasIntervention = item.has_intervention || false;
        const invCount = item.intervention_count || 0;
        const invBadgeHtml = hasIntervention
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700 border border-blue-200 ml-1.5">
                <i class="fa-solid fa-handshake text-[8px]"></i> Đã can thiệp (${invCount})
               </span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-600 border border-amber-200 ml-1.5">
                <i class="fa-regular fa-clock text-[8px]"></i> Chưa can thiệp
               </span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-50 text-slate-600 font-medium">${item.student_id}</td>
            <td class="py-4 px-6 border-b border-slate-50">
                <span class="text-slate-800 font-medium block">${item.student_name}</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${item.class_name || 'N/A'} • ${item.course_name || 'N/A'}</span>
            </td>
            <td class="py-4 px-6 border-b border-slate-50 ${probClass}">${(item.risk_probability * 100).toFixed(1)}%</td>
            <td class="py-4 px-6 border-b border-slate-50 text-slate-600">${item.effort_score}</td>
            <td class="py-4 px-6 border-b border-slate-50">
                <div class="flex flex-wrap items-center gap-1">
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 border border-red-200">Nguy cơ</span>
                    ${invBadgeHtml}
                </div>
            </td>
            <td class="py-4 px-6 border-b border-slate-50">
                <button onclick="viewStudentDetail('${item.student_id}', '${item.course_name}')" class="text-primary hover:text-secondary text-sm font-medium mr-3">Phân tích</button>
                <button onclick="openInterventionDirectly('${item.student_id}', '${item.student_name}', '${item.course_name}')" class="text-slate-500 hover:text-slate-800 text-sm font-medium"><i class="fa-solid fa-comment-medical"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openInterventionDirectly(studentId, studentName, courseName) {
    window.selectedStudentId = studentId;
    window.selectedCourseName = courseName || '';
    if (typeof openInterventionModal === 'function') {
        openInterventionModal();
    }
}
