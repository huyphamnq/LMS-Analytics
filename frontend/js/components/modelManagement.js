/**
 * Model Management Component - Redesigned
 * Layout: left panel = upload form, right panel = subjects list
 * Features: drag-drop files, modal detail view, inline delete confirm
 */

const ModelManagement = {
    state: {
        subjects: [],
        uploading: false,
        selectedFiles: { model: null, scaler: null, config: null },
        detailModal: null,
        deleteTarget: null,
    },

    render() {
        const container = document.getElementById('tab-model-management');
        if (!container) return;

        container.innerHTML = `
        <div class="min-h-screen bg-slate-50 p-6">
            <!-- Header -->
            <div class="mb-6">
                <h1 class="text-2xl font-bold text-slate-800">Quản lý Mô hình AI</h1>
                <p class="text-sm text-slate-500 mt-1">Tải lên và quản lý các mô hình dự đoán rủi ro theo từng môn học</p>
            </div>

            <!-- Two-column layout -->
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

                <!-- LEFT: Upload form -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                        <h2 class="text-base font-semibold text-slate-800 flex items-center gap-2">
                            <span class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                <i class="fa-solid fa-cloud-arrow-up text-primary text-sm"></i>
                            </span>
                            Tải lên mô hình mới
                        </h2>
                    </div>

                    <div class="p-6 space-y-5">
                        <!-- Subject info -->
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">ID Môn học <span class="text-red-500">*</span></label>
                                <input type="text" id="subject-id" placeholder="vd: cpp_intro, math101"
                                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                                <p class="text-[11px] text-slate-400 mt-1">Dạng snake_case, viết thường</p>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Tên môn học <span class="text-red-500">*</span></label>
                                <input type="text" id="subject-name" placeholder="vd: Nhập môn LT C++"
                                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Phiên bản</label>
                                <input type="text" id="model-version" value="1.0"
                                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Độ chính xác (%)</label>
                                <input type="number" id="model-accuracy" min="0" max="100" step="0.1" placeholder="85.5"
                                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                            </div>
                        </div>

                        <!-- File upload slots -->
                        <div class="space-y-3">
                            <p class="text-xs font-semibold text-slate-600 uppercase tracking-wide">Files mô hình</p>

                            ${this._renderFileSlot('model', 'File Model (.pkl)', true)}
                            ${this._renderFileSlot('scaler', 'File Scaler (.pkl)', true)}
                            ${this._renderFileSlot('config', 'File Config (.pkl)', false)}
                        </div>

                        <!-- Info note -->
                        <div class="flex gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                            <i class="fa-solid fa-circle-info text-blue-400 mt-0.5 shrink-0"></i>
                            <p class="text-xs text-blue-700">Ngưỡng quyết định (threshold) sẽ được đọc tự động từ <code class="bg-blue-100 px-1 rounded font-mono">model_config.pkl</code>. Không cần nhập thủ công.</p>
                        </div>

                        <!-- Submit -->
                        <button type="button" id="upload-btn" onclick="ModelManagement.submitUpload(event)"
                            class="w-full py-3 rounded-xl font-semibold text-white bg-primary hover:bg-primary/90 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                            <i class="fa-solid fa-cloud-arrow-up"></i> Tải Model Lên Hệ Thống
                        </button>
                    </div>
                </div>

                <!-- RIGHT: Subjects list -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                        <h2 class="text-base font-semibold text-slate-800 flex items-center gap-2">
                            <span class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                                <i class="fa-solid fa-cubes text-slate-500 text-sm"></i>
                            </span>
                            Các môn học đã có mô hình
                        </h2>
                        <button type="button" onclick="ModelManagement.loadSubjects()" class="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100">
                            <i class="fa-solid fa-arrows-rotate"></i> Làm mới
                        </button>
                    </div>
                    <div id="subjects-list-panel" class="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                        <!-- Subjects rendered here -->
                        <div class="p-8 text-center text-slate-400">
                            <i class="fa-solid fa-spinner fa-spin text-2xl mb-3 block"></i>
                            <p class="text-sm">Đang tải danh sách...</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- Detail Modal -->
        <div id="model-detail-modal" class="fixed inset-0 z-50 hidden items-center justify-center">
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="ModelManagement.closeModal()"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                <div id="modal-content"></div>
            </div>
        </div>

        <!-- Delete confirm dialog -->
        <div id="delete-confirm-dialog" class="fixed inset-0 z-50 hidden items-center justify-center">
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-slate-800">Xác nhận xóa</h3>
                        <p class="text-sm text-slate-500" id="delete-confirm-text">Bạn có chắc muốn xóa mô hình này?</p>
                    </div>
                </div>
                <p class="text-xs text-red-600 bg-red-50 p-3 rounded-lg mb-5"><i class="fa-solid fa-circle-info mr-1"></i> Hành động này không thể hoàn tác. Tất cả dữ liệu mô hình sẽ bị xóa vĩnh viễn.</p>
                <div class="flex gap-3">
                    <button type="button" onclick="ModelManagement.cancelDelete()" class="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm">
                        Hủy bỏ
                    </button>
                    <button type="button" onclick="ModelManagement.confirmDelete()" class="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors text-sm">
                        <i class="fa-solid fa-trash mr-1.5"></i> Xóa mô hình
                    </button>
                </div>
            </div>
        </div>

        <!-- Toast -->
        <div id="model-toast" class="fixed bottom-6 right-6 z-[60] hidden">
            <div id="model-toast-inner" class="flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium backdrop-blur-sm min-w-[260px]">
                <i id="model-toast-icon" class="fa-solid fa-circle-check shrink-0"></i>
                <span id="model-toast-msg"></span>
            </div>
        </div>
        `;

        this.loadSubjects();
    },

    _renderFileSlot(type, label, required) {
        const icon = type === 'model' ? 'fa-brain' : type === 'scaler' ? 'fa-sliders' : 'fa-gear';
        const color = type === 'model' ? 'indigo' : type === 'scaler' ? 'violet' : 'slate';
        return `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-blue-50/50 transition-all cursor-pointer group"
             id="${type}-slot"
             ondragover="ModelManagement.handleDragOver(event)"
             ondragleave="ModelManagement.handleDragLeave(event)"
             ondrop="ModelManagement.handleDrop(event,'${type}')"
             onclick="document.getElementById('${type}-file-input').click()">
            <input type="file" id="${type}-file-input" accept=".pkl,.joblib" class="hidden" onchange="ModelManagement.handleFileSelect(event,'${type}')">
            <div class="w-9 h-9 rounded-lg bg-${color}-100 flex items-center justify-center shrink-0">
                <i class="fa-solid ${icon} text-${color}-500 text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-700">${label}${required ? ' <span class="text-red-500">*</span>' : ''}</p>
                <p id="${type}-file-label" class="text-xs text-slate-400 truncate">Kéo thả hoặc nhấn để chọn file</p>
            </div>
            <div id="${type}-file-status" class="shrink-0 hidden">
                <i class="fa-solid fa-circle-check text-green-500"></i>
            </div>
        </div>`;
    },

    renderSubjectsList() {
        const panel = document.getElementById('subjects-list-panel');
        if (!panel) return;

        if (this.state.subjects.length === 0) {
            panel.innerHTML = `
                <div class="p-10 text-center">
                    <i class="fa-solid fa-box-open text-4xl text-slate-200 block mb-3"></i>
                    <p class="text-slate-500 font-medium text-sm">Chưa có mô hình nào</p>
                    <p class="text-slate-400 text-xs mt-1">Tải lên mô hình đầu tiên ở cột bên trái</p>
                </div>`;
            return;
        }

        panel.innerHTML = this.state.subjects.map(s => {
            const hasAccuracy = s.accuracy && s.accuracy > 0;
            const acc = hasAccuracy 
                ? (s.accuracy > 1 ? s.accuracy.toFixed(1) : (s.accuracy * 100).toFixed(1))
                : "0.0";
            
            const accNum = parseFloat(acc);
            const accColor = !hasAccuracy ? 'text-slate-400 bg-slate-100' : (accNum >= 80 ? 'text-green-600 bg-green-50' : accNum >= 60 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50');
            const trainedDate = s.trained_date ? new Date(s.trained_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
            
            // Priority: subject_name, then subject_id
            const displayName = s.subject_name || s.subject_id;

            return `
            <div class="p-4 hover:bg-slate-50 transition-colors" data-subject-id="${s.subject_id}">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-brain text-primary text-sm"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-slate-800 text-sm truncate">${displayName}</p>
                            <span class="inline-block text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded mt-0.5">${s.subject_id}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" onclick="ModelManagement.editMetadata('${s.subject_id}','${displayName.replace(/'/g,"\\'")}',${ (s.accuracy > 1 ? s.accuracy : s.accuracy*100).toFixed(1) },'${s.version}')"
                            class="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Sửa tên & accuracy">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                        <button type="button" onclick="ModelManagement.viewDetails('${s.subject_id}')"
                            class="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors" title="Xem chi tiết">
                            <i class="fa-solid fa-eye text-xs"></i>
                        </button>
                        <button type="button" onclick="ModelManagement.deleteModel('${s.subject_id}','${displayName}')"
                            class="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Xóa mô hình">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="flex items-center gap-3 mt-3 ml-12">
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${accColor}">${acc}% accuracy</span>
                    <span class="text-[11px] text-slate-400">v${s.version}</span>
                    <span class="text-[11px] text-slate-400">Threshold: ${s.threshold}</span>
                    <span class="text-[11px] text-slate-400 ml-auto">${trainedDate}</span>
                </div>
            </div>`;
        }).join('');
    },

    async loadSubjects() {
        const panel = document.getElementById('subjects-list-panel');
        if (panel) {
            panel.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="fa-solid fa-spinner fa-spin text-xl mb-2 block"></i>
                <p class="text-xs">Đang tải...</p>
            </div>`;
        }
        try {
            const subjects = await getAvailableSubjects();
            this.state.subjects = subjects || [];
            this.renderSubjectsList();
        } catch (e) {
            console.error(e);
            this.showToast('Lỗi khi tải danh sách môn học', 'error');
            if (panel) panel.innerHTML = `<div class="p-8 text-center text-red-400 text-sm">Không thể tải danh sách. Thử làm mới.</div>`;
        }
    },

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('border-primary', 'bg-blue-50');
    },

    handleDragLeave(e) {
        e.currentTarget.classList.remove('border-primary', 'bg-blue-50');
    },

    handleDrop(e, fileType) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-primary', 'bg-blue-50');
        const files = e.dataTransfer.files;
        if (files.length > 0) this._applyFile(files[0], fileType);
    },

    handleFileSelect(e, fileType) {
        const file = e.target.files[0];
        if (file) this._applyFile(file, fileType);
    },

    _applyFile(file, fileType) {
        if (!file.name.endsWith('.pkl') && !file.name.endsWith('.joblib')) {
            this.showToast('File phải có định dạng .pkl hoặc .joblib', 'error');
            return;
        }
        this.state.selectedFiles[fileType] = file;

        const label = document.getElementById(`${fileType}-file-label`);
        const status = document.getElementById(`${fileType}-file-status`);
        const slot = document.getElementById(`${fileType}-slot`);

        if (label) label.textContent = file.name;
        if (status) status.classList.remove('hidden');
        if (slot) {
            slot.classList.remove('border-slate-200', 'bg-slate-50');
            slot.classList.add('border-green-300', 'bg-green-50');
        }
        this.showToast(`Đã chọn: ${file.name}`, 'success');
    },

    async submitUpload(event) {
        if (event) event.preventDefault();
        
        const subjectId = document.getElementById('subject-id').value.trim();
        const subjectName = document.getElementById('subject-name').value.trim();
        const version = document.getElementById('model-version').value || '1.0';
        const accuracy = parseFloat(document.getElementById('model-accuracy').value) || 0;

        if (!subjectId) { this.showToast('Vui lòng nhập ID Môn Học', 'error'); return; }
        if (!subjectName) { this.showToast('Vui lòng nhập Tên Môn Học', 'error'); return; }
        if (!this.state.selectedFiles.model) { this.showToast('Vui lòng chọn file Model (.pkl)', 'error'); return; }
        if (!this.state.selectedFiles.scaler) { this.showToast('Vui lòng chọn file Scaler (.pkl)', 'error'); return; }

        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang tải lên...';

        try {
            const result = await uploadModelForSubject(
                subjectId,
                this.state.selectedFiles.model,
                this.state.selectedFiles.scaler,
                this.state.selectedFiles.config,
                { subject_name: subjectName, version, accuracy }
            );

            if (result.success) {
                this.showToast(`Mô hình "${subjectName}" đã được tải lên thành công!`, 'success');
                this._resetForm();
                await this.loadSubjects();
            } else {
                this.showToast(`Lỗi: ${result.error}`, 'error');
            }
        } catch (e) {
            this.showToast(`Lỗi: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Tải Model Lên Hệ Thống';
        }
    },

    _resetForm() {
        ['subject-id', 'subject-name', 'model-accuracy'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('model-version').value = '1.0';

        ['model', 'scaler', 'config'].forEach(type => {
            const label = document.getElementById(`${type}-file-label`);
            const status = document.getElementById(`${type}-file-status`);
            const slot = document.getElementById(`${type}-slot`);
            if (label) label.textContent = 'Kéo thả hoặc nhấn để chọn file';
            if (status) status.classList.add('hidden');
            if (slot) {
                slot.classList.add('border-slate-200', 'bg-slate-50');
                slot.classList.remove('border-green-300', 'bg-green-50');
            }
        });
        this.state.selectedFiles = { model: null, scaler: null, config: null };
    },

    editMetadata(subjectId, currentName, currentAccuracy, currentVersion) {
        // Show inline edit modal (reuse delete-confirm-dialog style)
        const modal = document.getElementById('model-detail-modal');
        const content = document.getElementById('modal-content');
        if (!modal || !content) return;

        content.innerHTML = `
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                    <i class="fa-solid fa-pen text-amber-500"></i>
                </div>
                <div>
                    <h3 class="font-semibold text-slate-800">Sửa thông tin mô hình</h3>
                    <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">${subjectId}</span>
                </div>
            </div>
            <button onclick="ModelManagement.closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="p-6 space-y-4">
            <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Tên môn học <span class="text-red-500">*</span></label>
                <input id="edit-subject-name" type="text" value="${currentName}"
                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Độ chính xác (%)</label>
                <input id="edit-accuracy" type="number" min="0" max="100" step="0.1" value="${currentAccuracy}"
                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="VD: 87.5">
                <p class="text-[11px] text-slate-400 mt-1">Nhập % từ kết quả huấn luyện (ví dụ: 87.5)</p>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Phiên bản</label>
                <input id="edit-version" type="text" value="${currentVersion}"
                    class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
            </div>
        </div>
        <div class="px-6 pb-6 flex gap-3">
            <button onclick="ModelManagement.closeModal()" class="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm">
                Hủy
            </button>
            <button onclick="ModelManagement.saveEditMetadata('${subjectId}')"
                class="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi
            </button>
        </div>`;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('edit-subject-name').focus();
    },

    async saveEditMetadata(subjectId) {
        const newName = document.getElementById('edit-subject-name')?.value.trim();
        const newAcc = parseFloat(document.getElementById('edit-accuracy')?.value);
        const newVer = document.getElementById('edit-version')?.value.trim();

        if (!newName) { this.showToast('Tên môn học không được để trống', 'error'); return; }

        const result = await updateSubjectMetadata(subjectId, {
            subject_name: newName,
            accuracy: isNaN(newAcc) ? undefined : newAcc,
            version: newVer || undefined,
        });

        if (result.success) {
            this.showToast(`Đã cập nhật: "${newName}"`, 'success');
            this.closeModal();
            await this.loadSubjects();
        } else {
            this.showToast('Lỗi: ' + result.error, 'error');
        }
    },

    async viewDetails(subjectId) {
        const modal = document.getElementById('model-detail-modal');
        const content = document.getElementById('modal-content');
        if (!modal || !content) return;

        content.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        try {
            const m = await getSubjectMetadata(subjectId);
            if (!m) throw new Error('Không có dữ liệu');

            const hasAccuracy = m.accuracy && m.accuracy > 0;
            const acc = hasAccuracy 
                ? (m.accuracy > 1 ? m.accuracy.toFixed(1) : (m.accuracy * 100).toFixed(1))
                : "0.0";
            const trainedDate = m.trained_date ? new Date(m.trained_date).toLocaleString('vi-VN') : 'N/A';
            const displayName = m.subject_name || m.subject_id;

            const topRisk = m.top_risk_increase || [];
            const topSafe = m.top_risk_decrease || [];

            content.innerHTML = `
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <i class="fa-solid fa-brain text-primary"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-slate-800">${displayName}</h3>
                        <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">${m.subject_id}</span>
                    </div>
                </div>
                <button onclick="ModelManagement.closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="p-6 space-y-5">
                <!-- Metrics row -->
                <div class="grid grid-cols-3 gap-3">
                    <div class="${hasAccuracy ? 'bg-green-50' : 'bg-slate-50'} rounded-xl p-3 text-center">
                        <p class="text-2xl font-bold ${hasAccuracy ? 'text-green-600' : 'text-slate-400'}">${hasAccuracy ? acc + '%' : 'Chưa có'}</p>
                        <p class="text-xs ${hasAccuracy ? 'text-green-700' : 'text-slate-500'} mt-0.5">Độ chính xác</p>
                    </div>
                    <div class="bg-blue-50 rounded-xl p-3 text-center">
                        <p class="text-2xl font-bold text-blue-600">${m.threshold}</p>
                        <p class="text-xs text-blue-700 mt-0.5">Ngưỡng quyết định</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-3 text-center">
                        <p class="text-lg font-bold text-slate-700">v${m.version}</p>
                        <p class="text-xs text-slate-500 mt-0.5">Phiên bản</p>
                    </div>
                </div>

                <!-- Feature importances -->
                ${topRisk.length > 0 ? `
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        <i class="fa-solid fa-arrow-trend-up text-red-400 mr-1"></i> Top hành vi tăng nguy cơ
                    </p>
                    <div class="space-y-1.5">
                        ${topRisk.slice(0, 4).map((f, i) => {
                            const name = typeof f === 'object' ? (f.feature || f.name || '') : f;
                            const coef = typeof f === 'object' ? f.coefficient : null;
                            const barW = Math.min(100, Math.abs(coef || 0) * 200);
                            return `<div class="flex items-center gap-2">
                                <span class="text-[10px] text-slate-400 w-4 text-right">${i + 1}</span>
                                <div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div class="h-full bg-red-400 rounded-full" style="width:${barW || 50}%"></div>
                                </div>
                                <span class="text-xs text-slate-600 truncate max-w-[180px]">${name}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                ${topSafe.length > 0 ? `
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        <i class="fa-solid fa-arrow-trend-down text-green-400 mr-1"></i> Top hành vi giảm nguy cơ
                    </p>
                    <div class="space-y-1.5">
                        ${topSafe.slice(0, 4).map((f, i) => {
                            const name = typeof f === 'object' ? (f.feature || f.name || '') : f;
                            const coef = typeof f === 'object' ? f.coefficient : null;
                            const barW = Math.min(100, Math.abs(coef || 0) * 200);
                            return `<div class="flex items-center gap-2">
                                <span class="text-[10px] text-slate-400 w-4 text-right">${i + 1}</span>
                                <div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div class="h-full bg-green-400 rounded-full" style="width:${barW || 50}%"></div>
                                </div>
                                <span class="text-xs text-slate-600 truncate max-w-[180px]">${name}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                <!-- Meta info -->
                <div class="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-500">
                    <div class="flex justify-between"><span>Ngày huấn luyện</span><span class="font-medium text-slate-700">${trainedDate}</span></div>
                    <div class="flex justify-between"><span>File model</span><span class="font-mono text-slate-600">${m.model_file || 'logistic_student_model.pkl'}</span></div>
                    <div class="flex justify-between"><span>File scaler</span><span class="font-mono text-slate-600">${m.scaler_file || 'scaler_student.pkl'}</span></div>
                </div>
            </div>`;
        } catch (e) {
            content.innerHTML = `<div class="p-8 text-center text-red-400 text-sm"><i class="fa-solid fa-circle-xmark text-2xl block mb-2"></i>${e.message}</div>`;
        }
    },

    closeModal() {
        const modal = document.getElementById('model-detail-modal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    },

    deleteModel(subjectId, subjectName) {
        this.state.deleteTarget = subjectId;
        const text = document.getElementById('delete-confirm-text');
        if (text) text.textContent = `Xóa mô hình "${subjectName || subjectId}"?`;
        const dialog = document.getElementById('delete-confirm-dialog');
        if (dialog) { dialog.classList.remove('hidden'); dialog.classList.add('flex'); }
    },

    cancelDelete() {
        this.state.deleteTarget = null;
        const dialog = document.getElementById('delete-confirm-dialog');
        if (dialog) { dialog.classList.add('hidden'); dialog.classList.remove('flex'); }
    },

    async confirmDelete() {
        const subjectId = this.state.deleteTarget;
        if (!subjectId) return;
        this.cancelDelete();

        try {
            const result = await deleteSubjectModel(subjectId);
            if (result.success) {
                this.showToast('Đã xóa mô hình thành công', 'success');
                await this.loadSubjects();
            } else {
                this.showToast(`Lỗi: ${result.error}`, 'error');
            }
        } catch (e) {
            this.showToast(`Lỗi: ${e.message}`, 'error');
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('model-toast');
        const inner = document.getElementById('model-toast-inner');
        const icon = document.getElementById('model-toast-icon');
        const msg = document.getElementById('model-toast-msg');
        if (!toast || !inner) return;

        const config = {
            success: { bg: 'bg-green-600', icon: 'fa-circle-check' },
            error:   { bg: 'bg-red-600',   icon: 'fa-circle-xmark' },
            info:    { bg: 'bg-blue-600',  icon: 'fa-circle-info' },
        };
        const { bg, icon: iconClass } = config[type] || config.info;

        inner.className = `flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium ${bg} min-w-[260px]`;
        if (icon) icon.className = `fa-solid ${iconClass} shrink-0`;
        if (msg) msg.textContent = message;

        toast.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }
};
