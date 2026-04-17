async function loadEarlyWarning() {
    const res = await apiFetch('/early-warning');
    if (!res) return;
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
            <td class="py-4 px-6 border-b border-slate-50">
                <span class="text-slate-800 font-medium block">${item.student_name}</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${item.class_name || 'N/A'} • ${item.course_name || 'N/A'}</span>
            </td>
            <td class="py-4 px-6 border-b border-slate-50 ${probClass}">${(item.risk_probability * 100).toFixed(1)}%</td>
            <td class="py-4 px-6 border-b border-slate-50 text-slate-600">${item.effort_score}</td>
            <td class="py-4 px-6 border-b border-slate-50">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 border border-red-200">Nguy cơ</span>
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
