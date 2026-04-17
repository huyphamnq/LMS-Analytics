const API_URL = 'http://127.0.0.1:8000';

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    // Set default headers
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }
    
    // Add auth header if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
    
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
        console.error(`API Fetch Error (${endpoint}):`, error);
        throw error;
    }
}
