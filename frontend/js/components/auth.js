let authMode = 'login';

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
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
    
    const displayName = window.currentUser?.full_name || 'Giảng viên';
    
    // Update Dropdown info
    const dropdownName = document.getElementById('dropdown-user-name');
    const dropdownEmail = document.getElementById('dropdown-user-email');
    if (dropdownName) dropdownName.innerText = displayName;
    if (dropdownEmail) dropdownEmail.innerText = window.currentUser?.email || 'N/A';
    
    // Update navbar avatar
    const navAvatar = document.getElementById('user-nav-avatar');
    if (navAvatar) {
        navAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`;
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
    const endpoint = type === 'login' ? '/auth/login' : '/auth/register';
    
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
                showMainDashboard();
            } else {
                alert("Đăng ký thành công! Vui lòng đăng nhập.");
                toggleAuthMode();
            }
        } else {
            alert(data.detail || "Có lỗi xảy ra");
        }
    } catch (error) {
        console.error("Auth error:", error);
        alert("Không thể kết nối đến máy chủ");
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

// Chạy check auth khi document ready
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
