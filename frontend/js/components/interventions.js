async function loadInterventions() {
    const res = await apiFetch(`/interventions${window.getFilterQueryString ? window.getFilterQueryString() : ''}`);
    if (!res) return;
    const data = await res.json();
    
    const tbody = document.getElementById('intervention-list');
    tbody.innerHTML = '';
    
    data.forEach(item => {
        let iconHtml = '<i class="fa-solid fa-envelope text-blue-500 w-5"></i>';
        if(item.intervention_type.includes('Gọi')) iconHtml = '<i class="fa-solid fa-phone text-emerald-500 w-5"></i>';
        if(item.intervention_type.includes('Gặp')) iconHtml = '<i class="fa-solid fa-handshake text-indigo-500 w-5"></i>';
        
        let dateObj = new Date(item.date);
        let dateStr = (!isNaN(dateObj)) ? dateObj.toLocaleString('vi-VN', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}) : item.date;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-100 whitespace-nowrap"><span class="px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-600">${dateStr}</span></td>
            <td class="py-4 px-6 border-b border-slate-100 font-medium text-slate-800">
                ${item.student_name}
                <div class="text-[10px] text-slate-400 font-normal mt-0.5">${item.student_id}</div>
            </td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-600 text-xs font-medium">${item.course_name || 'N/A'}</td>
            <td class="py-4 px-6 border-b border-slate-100 flex items-center mt-2">${iconHtml} <span class="ml-2 font-medium">${item.intervention_type}</span></td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-500 italic text-xs leading-relaxed max-w-xs truncate" title="${item.note}">${item.note}</td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-500 text-xs">${item.created_by || 'Hệ thống'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function openInterventionModal() {
    if (!window.selectedStudentId) {
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
    
    if(!window.selectedStudentId) return;
    
    try {
        const res = await apiFetch('/intervention', {
            method: 'POST',
            body: JSON.stringify({
                student_id: window.selectedStudentId,
                course_name: window.selectedCourseName || '',
                intervention_type: type,
                note: note
            })
        });
        
        if (res && res.ok) {
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
