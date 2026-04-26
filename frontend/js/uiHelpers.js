/**
 * UI Helpers - Common UI operations without global state pollution
 * Works with the centralized AppState
 */

const UIHelpers = {
  // ==================== LOADING ====================
  showLoading(show = true) {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    
    if (show) {
      el.classList.remove('hidden');
      AppState.setLoading(true);
    } else {
      el.classList.add('hidden');
      AppState.setLoading(false);
    }
  },

  hideLoading() {
    this.showLoading(false);
  },

  // ==================== NOTIFICATIONS ====================
  showNotification(message, type = 'info', duration = 5000) {
    const notification = {
      id: Date.now(),
      message,
      type, // 'success', 'error', 'warning', 'info'
      duration
    };
    
    // Add to state
    AppState.ui.notifications.push(notification);
    
    let container = document.getElementById('notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications-container';
        // Tailwind classes for fixed container
        container.className = 'fixed top-4 right-4 z-[9999] flex flex-col items-end space-y-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const notifEl = this._createNotificationElement(notification);
    container.appendChild(notifEl);
    
    // Animate in
    requestAnimationFrame(() => {
        notifEl.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // Auto-remove after duration
    setTimeout(() => {
      notifEl.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
          notifEl.remove();
          AppState.ui.notifications = AppState.ui.notifications.filter(
            n => n.id !== notification.id
          );
      }, 300); // Wait for transition
    }, duration);
    
    return notification.id;
  },

  _createNotificationElement(notification) {
    const div = document.createElement('div');
    
    // Base styles
    let bgClass = 'bg-white';
    let textClass = 'text-slate-800';
    let borderClass = 'border-slate-200';
    let iconHTML = '';

    if (notification.type === 'success') {
        borderClass = 'border-emerald-200';
        iconHTML = '<i class="fa-solid fa-check-circle text-emerald-500 mr-3"></i>';
    } else if (notification.type === 'error') {
        borderClass = 'border-red-200';
        iconHTML = '<i class="fa-solid fa-circle-exclamation text-red-500 mr-3"></i>';
    } else if (notification.type === 'warning') {
        borderClass = 'border-amber-200';
        iconHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-500 mr-3"></i>';
    } else {
        borderClass = 'border-blue-200';
        iconHTML = '<i class="fa-solid fa-circle-info text-blue-500 mr-3"></i>';
    }

    div.className = `pointer-events-auto flex items-center p-4 rounded-xl shadow-lg border ${bgClass} ${borderClass} ${textClass} min-w-[280px] max-w-sm transition-all duration-300 ease-out transform translate-x-full opacity-0 backdrop-blur-md`;
    div.innerHTML = `
        ${iconHTML}
        <div class="flex-1 text-sm font-medium">${notification.message}</div>
        <button class="ml-4 text-slate-400 hover:text-slate-600 focus:outline-none" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-times"></i>
        </button>
    `;
    return div;
  },

  // ==================== MODALS ====================
  showModal(modalId, data = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.warn(`Modal ${modalId} not found`);
      return;
    }
    
    modal.classList.remove('hidden');
    AppState.ui.modals[modalId] = { isOpen: true, data };
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.add('hidden');
    AppState.ui.modals[modalId] = { isOpen: false };
  },

  isModalOpen(modalId) {
    return AppState.ui.modals[modalId]?.isOpen === true;
  },

  // ==================== FILTERS ====================
  async loadFilters() {
    if (AppState.getFilters()) return; // Cache hit
    
    this.showLoading(true);
    try {
      const res = await apiFetch('/dashboard/filters');
      if (!res) throw new Error('Failed to load filters');
      
      const filters = await res.json();
      AppState.setFilters(filters);
      this._populateFilterSelects(filters);
    } catch (error) {
      console.error('Error loading filters:', error);
      this.showNotification('Lỗi tải bộ lọc', 'error');
    } finally {
      this.hideLoading();
    }
  },

  _populateFilterSelects(filters) {
    const courseSelect = document.getElementById('filter-course');
    const classSelect = document.getElementById('filter-class');
    
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">Tất cả môn học</option>';
      Object.keys(filters).forEach(course => {
        courseSelect.innerHTML += `<option value="${course}">${course}</option>`;
      });
    }
    
    if (classSelect) {
      this._updateClassOptions(filters, classSelect);
    }
  },

  _updateClassOptions(filters, classSelect, selectedCourse = '') {
    classSelect.innerHTML = '<option value="">Tất cả lớp học</option>';
    
    const allClasses = new Set();
    
    if (selectedCourse && filters[selectedCourse]) {
      filters[selectedCourse].forEach(cls => allClasses.add(cls));
    } else {
      Object.values(filters).forEach(courses => {
        courses.forEach(cls => allClasses.add(cls));
      });
    }
    
    Array.from(allClasses).sort().forEach(cls => {
      classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
    });
  },

  handleCourseChange() {
    const courseSelect = document.getElementById('filter-course');
    const classSelect = document.getElementById('filter-class');
    const course = courseSelect?.value || '';
    
    AppState.setCurrentFilter(course, '');
    
    const filters = AppState.getFilters();
    if (filters) {
      this._updateClassOptions(filters, classSelect, course);
    }
    
    this.reloadCurrentTab();
  },

  handleClassChange() {
    const courseSelect = document.getElementById('filter-course');
    const classSelect = document.getElementById('filter-class');
    const course = courseSelect?.value || '';
    const className = classSelect?.value || '';
    
    AppState.setCurrentFilter(course, className);
    this.reloadCurrentTab();
  },

  // ==================== TABS ====================
  async reloadCurrentTab() {
    const activeNav = document.querySelector('.nav-item.active');
    if (!activeNav) return;
    
    this.showLoading(true);
    const tabId = activeNav.id.replace('nav-', '');
    AppState.setCurrentTab(tabId);
    
    try {
      switch (tabId) {
        case 'overview':
          if (typeof loadSummary === 'function') await loadSummary();
          break;
        case 'early-warning':
          if (typeof loadEarlyWarning === 'function') await loadEarlyWarning();
          break;
        case 'student-analysis':
          if (typeof loadStudentList === 'function') await loadStudentList();
          break;
        case 'anomaly-detection':
          if (typeof loadIntegrityData === 'function') await loadIntegrityData();
          break;
        case 'intervention-history':
          if (typeof loadInterventions === 'function') await loadInterventions();
          break;
        case 'ai-integration':
          if (typeof loadAIIntegration === 'function') await loadAIIntegration();
          break;
      }
    } catch (error) {
      console.error(`Error reloading tab ${tabId}:`, error);
      this.showNotification(`Lỗi tải ${tabId}`, 'error');
    } finally {
      this.hideLoading();
    }
  },

  // ==================== CHARTS ====================
  registerChart(key, instance) {
    AppState.setChartInstance(key, instance);
  },

  getChart(key) {
    return AppState.getChartInstance(key);
  },

  destroyChart(key) {
    const chart = this.getChart(key);
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
      delete AppState.ui.chartInstances[key];
    }
  },

  // ==================== ELEMENT VISIBILITY ====================
  show(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.remove('hidden');
  },

  hide(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('hidden');
  },

  toggle(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.toggle('hidden');
  },

  isVisible(elementId) {
    const el = document.getElementById(elementId);
    return el ? !el.classList.contains('hidden') : false;
  },
};

// Expose to window for global access (minimal exposure)
if (typeof window !== 'undefined') {
  window.UI = UIHelpers;
  window.AppState = AppState;
}
