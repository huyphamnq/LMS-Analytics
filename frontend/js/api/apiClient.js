const API_URL = 'http://127.0.0.1:8000';
const API_VERSION = 'v1';

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    // Build headers from caller first; only add Content-Type when needed.
    const headers = {
        ...(options.headers || {})
    };

    const method = (options.method || 'GET').toUpperCase();
    const hasBody = options.body !== undefined && options.body !== null;
    const isFormData = options.body instanceof FormData;

    if (!isFormData && hasBody && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }
    
    // Add auth header if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Ensure endpoint includes API version
    let fullEndpoint = endpoint;
    if (!endpoint.startsWith('http')) {
        if (!endpoint.startsWith(`/${API_VERSION}`)) {
            fullEndpoint = `/${API_VERSION}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        }
    }
    
    const url = fullEndpoint.startsWith('http') ? fullEndpoint : `${API_URL}${fullEndpoint}`;
    
    try {
        const response = await fetch(url, { ...options, headers });
        
        // Handle 401 Unauthorized globally
        if (response.status === 401) {
            console.warn("Unauthorized request. Logging out...");
            if (typeof handleLogout === 'function') handleLogout();
            return null;
        }
        
        return response;
    } catch (error) {
        console.error(`API Fetch Error (${url}):`, error);
        throw error;
    }
}

// =========================================================
// Model Management API Functions
// =========================================================

/**
 * Lấy danh sách tất cả subjects có model
 */
async function getAvailableSubjects() {
    try {
        const response = await apiFetch('/subjects/list');
        if (!response) return [];
        
        if (!response.ok) {
            console.error(`Failed to fetch subjects: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        return data.subjects || [];
    } catch (error) {
        console.error('Error fetching subjects:', error);
        return [];
    }
}

/**
 * Lấy metadata của một subject
 */
async function getSubjectMetadata(subjectId) {
    try {
        const response = await apiFetch(`/subjects/${subjectId}/metadata`);
        if (!response) return null;
        
        if (!response.ok) {
            console.error(`Failed to fetch metadata: ${response.status}`);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching metadata for ${subjectId}:`, error);
        return null;
    }
}

/**
 * Upload model cho một subject
 * @param {string} subjectId - ID của subject
 * @param {File} modelFile - Model file (.pkl)
 * @param {File} scalerFile - Scaler file (.pkl)
 * @param {File} configFile - Config file (.pkl) - optional (chứa threshold)
 * @param {object} metadata - {subject_name, version, accuracy}
 * 
 * ⚠️ Threshold được lấy từ model_config.pkl, không từ form
 */
async function uploadModelForSubject(subjectId, modelFile, scalerFile, configFile, metadata = {}) {
    try {
        const formData = new FormData();
        formData.append('model_file', modelFile);
        formData.append('scaler_file', scalerFile);
        
        // Append config file if provided (chứa threshold)
        if (configFile) {
            formData.append('config_file', configFile);
        }
        
        if (metadata.subject_name) formData.append('subject_name', metadata.subject_name);
        if (metadata.version) formData.append('version', metadata.version);
        if (metadata.accuracy !== undefined) formData.append('accuracy', metadata.accuracy);
        // ⚠️ Không gửi threshold - sẽ lấy từ config_file
        
        const response = await apiFetch(`/subjects/${subjectId}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response) {
            return { success: false, error: 'Network error' };
        }
        
        if (!response.ok) {
            const error = await response.json();
            return { success: false, error: error.detail || 'Upload failed' };
        }
        
        const result = await response.json();
        return { success: true, data: result };
    } catch (error) {
        console.error(`Error uploading model for ${subjectId}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Xóa model của một subject
 */
async function deleteSubjectModel(subjectId) {
    try {
        const response = await apiFetch(`/subjects/${subjectId}`, {
            method: 'DELETE'
        });
        
        if (!response) {
            return { success: false, error: 'Network error' };
        }
        
        if (!response.ok) {
            const error = await response.json();
            return { success: false, error: error.detail || 'Delete failed' };
        }
        
        const result = await response.json();
        return { success: true, data: result };
    } catch (error) {
        console.error(`Error deleting model for ${subjectId}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Cập nhật metadata (tên, accuracy) của subject đã upload
 */
async function updateSubjectMetadata(subjectId, { subject_name, accuracy, version } = {}) {
    try {
        const params = new URLSearchParams();
        if (subject_name !== undefined && subject_name !== null) params.append('subject_name', subject_name);
        if (accuracy !== undefined && accuracy !== null) params.append('accuracy', accuracy);
        if (version !== undefined && version !== null) params.append('version', version);

        const response = await apiFetch(`/subjects/${subjectId}/metadata?${params.toString()}`, {
            method: 'PATCH',
        });

        if (!response) return { success: false, error: 'Network error' };
        if (!response.ok) {
            const err = await response.json();
            return { success: false, error: err.detail || 'Update failed' };
        }
        return { success: true, data: await response.json() };
    } catch (error) {
        console.error(`Error updating metadata for ${subjectId}:`, error);
        return { success: false, error: error.message };
    }
}
