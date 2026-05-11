let authMode = 'login';

function checkAuth() {
    const token = localStorage.getItem('token');
    let user = null;

    try {
        const rawUser = localStorage.getItem('user');
        user = rawUser ? JSON.parse(rawUser) : null;
    } catch (error) {
        console.warn('Invalid user data in localStorage. Clearing auth cache.', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    }
    
    if (token && user) {
        window.currentUser = user;
        showMainDashboard();
    } else {
        showAuthOverlay();
    }
}

function showMainDashboard() {
    const authOverlay = document.getElementById('auth-overlay');
    const mainDashboard = document.getElementById('main-dashboard');
    
    authOverlay.classList.add('hidden');
    authOverlay.style.display = 'none';
    
    mainDashboard.classList.remove('hidden');
    mainDashboard.style.display = 'flex';
    
    // Update body class to respect CSS !important rules
    document.body.classList.remove('is-not-logged-in');
    document.body.classList.add('is-logged-in');
    
    const displayName = window.currentUser?.full_name || 'Giảng viên';
    
    // Update Dropdown info
    const dropdownName = document.getElementById('dropdown-user-name');
    const dropdownEmail = document.getElementById('dropdown-user-email');
    if (dropdownName) dropdownName.innerText = displayName;
    if (dropdownEmail) dropdownEmail.innerText = window.currentUser?.email || 'N/A';
    
    // Update navbar and dropdown avatars
    const navAvatar = document.getElementById('user-nav-avatar');
    const dropdownAvatar = document.getElementById('dropdown-nav-avatar');
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`;
    
    if (navAvatar) {
        navAvatar.src = avatarUrl;
    }
    if (dropdownAvatar) {
        dropdownAvatar.src = avatarUrl;
    }
    
    if (typeof initDashboard === 'function') initDashboard();
    if (typeof loadSettings === 'function') loadSettings();
}

function showAuthOverlay() {
    const authOverlay = document.getElementById('auth-overlay');
    const mainDashboard = document.getElementById('main-dashboard');
    
    authOverlay.classList.remove('hidden');
    authOverlay.style.display = 'block';
    
    mainDashboard.classList.add('hidden');
    mainDashboard.style.display = 'none';
    
    // Update body class to respect CSS !important rules
    document.body.classList.remove('is-logged-in');
    document.body.classList.add('is-not-logged-in');
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleBtn = document.getElementById('auth-toggle-btn');

    if (authMode === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        title.innerText = "Tạo tài khoản";
        subtitle.innerText = "Tham gia tương lai của phân tích giáo dục ngay hôm nay.";
        toggleText.innerText = "Đã có tài khoản?";
        toggleBtn.innerText = "Đăng nhập ngay.";
    } else {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        title.innerText = "Chào mừng quay lại";
        subtitle.innerText = "Nhập email và mật khẩu để truy cập tài khoản của bạn.";
        toggleText.innerText = "Chưa có tài khoản?";
        toggleBtn.innerText = "Đăng ký ngay.";
    }
}

async function handleAuthSubmit(event, type) {
    event.preventDefault();
    const email = document.getElementById(`${type}-email`).value;
    const password = document.getElementById(`${type}-password`).value;
    const endpoint = type === 'login' ? '/v1/auth/login' : '/v1/auth/register';
    
    const payload = { email, password };
    if (type === 'register') {
        payload.full_name = document.getElementById('register-name').value;
    }

    try {
        const response = await fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'http://127.0.0.1:8000'}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            if (type === 'login') {
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.currentUser = data.user;
                
                // Handle "Remember Me"
                const rememberCheckbox = document.getElementById('login-remember');
                if (rememberCheckbox && rememberCheckbox.checked) {
                    localStorage.setItem('rememberedEmail', email);
                } else {
                    localStorage.removeItem('rememberedEmail');
                }
                
                // Use location.reload() to ensure all components and charts are 
                // cleanly initialized with the new token, identical to F5 behavior.
                location.reload();
            } else {
                UIHelpers.showNotification("Đăng ký thành công! Vui lòng đăng nhập.", "success");
                toggleAuthMode();
            }
        } else {
            UIHelpers.showNotification(data.detail || "Có lỗi xảy ra", "error");
        }
    } catch (error) {
        console.error("Auth error:", error);
        UIHelpers.showNotification("Không thể kết nối đến máy chủ", "error");
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.currentUser = null;
    location.reload();
}

function toggleProfileMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('hidden');
}

// Close dropdown when clicking outside
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('profile-dropdown');
    const profileBtn = document.getElementById('profile-btn');
    
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (profileBtn && !profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }
});

function initAuthFeatures() {
    // Password Toggle Logic
    const toggleButtons = [
        { btnId: 'toggle-password', inputId: 'login-password' },
        { btnId: 'toggle-register-password', inputId: 'register-password' }
    ];

    toggleButtons.forEach(({ btnId, inputId }) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);

        if (btn && input) {
            btn.addEventListener('click', () => {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                
                // Toggle icon
                btn.classList.toggle('fa-eye');
                btn.classList.toggle('fa-eye-slash');
            });
        }
    });

    // Remember Me Pre-fill
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        const emailInput = document.getElementById('login-email');
        const rememberCheckbox = document.getElementById('login-remember');
        
        if (emailInput) emailInput.value = rememberedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }
}

// Chạy check auth khi document ready
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initAuthFeatures();
});
