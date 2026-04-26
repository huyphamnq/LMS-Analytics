let currentInterventions = [];

async function loadInterventions() {
    const res = await apiFetch(`/interventions${window.getFilterQueryString ? window.getFilterQueryString() : ''}`);
    if (!res) return;
    const data = await res.json();
    currentInterventions = data;
    
    const tbody = document.getElementById('intervention-list');
    tbody.innerHTML = '';
    
    data.forEach((item, index) => {
        let iconHtml = '<i class="fa-solid fa-envelope text-blue-500 w-5"></i>';
        if(item.intervention_type.includes('Gọi')) iconHtml = '<i class="fa-solid fa-phone text-emerald-500 w-5"></i>';
        if(item.intervention_type.includes('Gặp')) iconHtml = '<i class="fa-solid fa-handshake text-indigo-500 w-5"></i>';
        
        let dateObj = new Date(item.date);
        let dateStr = (!isNaN(dateObj)) ? dateObj.toLocaleString('vi-VN', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}) : item.date;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors cursor-pointer group";
        tr.onclick = () => showInterventionDetail(index);
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-100 whitespace-nowrap"><span class="px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-600">${dateStr}</span></td>
            <td class="py-4 px-6 border-b border-slate-100 font-medium text-slate-800">
                ${item.student_name}
                <div class="text-[10px] text-slate-400 font-normal mt-0.5">${item.student_id}</div>
            </td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-600 text-xs font-medium">${item.course_name || 'N/A'}</td>
            <td class="py-4 px-6 border-b border-slate-100 flex items-center mt-2">${iconHtml} <span class="ml-2 font-medium">${item.intervention_type}</span></td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-500 italic text-xs leading-relaxed max-w-xs truncate" title="${item.note}">${item.note}</td>
            <td class="py-4 px-6 border-b border-slate-100 text-slate-500 text-xs font-medium">${item.created_by || 'Hệ thống'}</td>
            <td class="py-4 px-6 border-b border-slate-100 text-right">
                <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-primary transition-colors text-xs"></i>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showInterventionDetail(index) {
    const item = currentInterventions[index];
    if (!item) return;

    document.getElementById('detail-inv-student').innerText = `${item.student_name} (${item.student_id})`;
    document.getElementById('detail-inv-course').innerText = item.course_name || 'N/A';
    document.getElementById('detail-inv-type').innerText = item.intervention_type;
    
    let dateObj = new Date(item.date);
    let dateStr = (!isNaN(dateObj)) ? dateObj.toLocaleString('vi-VN', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}) : item.date;
    document.getElementById('detail-inv-date').innerText = dateStr;
    
    document.getElementById('detail-inv-note').innerText = item.note;
    document.getElementById('detail-inv-user').innerText = item.created_by || 'Hệ thống';

    const modal = document.getElementById('intervention-detail-modal');
    const content = document.getElementById('intervention-detail-content');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
}

function closeInterventionDetailModal() {
    const modal = document.getElementById('intervention-detail-modal');
    const content = document.getElementById('intervention-detail-content');
    
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
}

function openInterventionModal() {
    if (!window.selectedStudentId) {
        UIHelpers.showNotification("Vui lòng chọn một sinh viên trước!", "warning");
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
            UIHelpers.showNotification('Đã lưu can thiệp thành công!', 'success');
            closeInterventionModal();
            loadInterventions(); // Reload table
        } else {
            UIHelpers.showNotification('Lỗi khi lưu can thiệp!', 'error');
        }
    } catch (err) {
        console.error(err);
        UIHelpers.showNotification('Lỗi kết nối máy chủ!', 'error');
    }
}
