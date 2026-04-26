/**
 * Centralized State Management for LMS Analytics Dashboard
 * Replaces window.* globals with a clean, manageable state object
 */

const AppState = {
  // ==================== AUTH STATE ====================
  auth: {
    currentUser: null,
    token: null,
    isAuthenticated: false,
  },

  // ==================== DASHBOARD STATE ====================
  dashboard: {
    allStudents: [],
    selectedStudentId: null,
    currentViewedStudent: null,
    filters: null,
    currentFilter: {
      course: '',
      className: '',
    },
    currentTab: 'overview',
  },

  // ==================== UI STATE ====================
  ui: {
    isLoading: false,
    chartInstances: {},
    notifications: [],
    modals: {},
  },

  // ==================== API STATE ====================
  api: {
    baseUrl: '/v1',
    timeout: 30000,
  },

  // ==================== GETTERS ====================
  getUser() {
    return this.auth.currentUser;
  },

  getStudents() {
    return this.dashboard.allStudents;
  },

  getSelectedStudentId() {
    return this.dashboard.selectedStudentId;
  },

  getCurrentViewedStudent() {
    return this.dashboard.currentViewedStudent;
  },

  getFilters() {
    return this.dashboard.filters;
  },

  getCurrentFilter() {
    return this.dashboard.currentFilter;
  },

  isLoading() {
    return this.ui.isLoading;
  },

  getChartInstance(key) {
    return this.ui.chartInstances[key];
  },

  // ==================== SETTERS ====================
  setUser(user, token = null) {
    this.auth.currentUser = user;
    this.auth.token = token;
    this.auth.isAuthenticated = !!user;
    this._notifyListeners('auth');
  },

  clearUser() {
    this.auth.currentUser = null;
    this.auth.token = null;
    this.auth.isAuthenticated = false;
    this._notifyListeners('auth');
  },

  setStudents(students) {
    this.dashboard.allStudents = students;
    this._notifyListeners('students');
  },

  setSelectedStudentId(id) {
    this.dashboard.selectedStudentId = id;
    this._notifyListeners('selectedStudentId');
  },

  setCurrentViewedStudent(student) {
    this.dashboard.currentViewedStudent = student;
    this._notifyListeners('viewedStudent');
  },

  setFilters(filters) {
    this.dashboard.filters = filters;
    this._notifyListeners('filters');
  },

  setCurrentFilter(course = '', className = '') {
    this.dashboard.currentFilter = { course, className };
    this._notifyListeners('filter');
  },

  setLoading(isLoading) {
    this.ui.isLoading = isLoading;
    this._notifyListeners('loading');
  },

  setChartInstance(key, instance) {
    this.ui.chartInstances[key] = instance;
  },

  setCurrentTab(tabId) {
    this.dashboard.currentTab = tabId;
    this._notifyListeners('tab');
  },

  // ==================== LISTENERS ====================
  listeners: {},

  subscribe(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  },

  _notifyListeners(event) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(this);
        } catch (error) {
          console.error(`Error in listener for ${event}:`, error);
        }
      });
    }
  },

  // ==================== UTILITIES ====================
  getFilterQueryString() {
    const { course, className } = this.dashboard.currentFilter;
    const query = new URLSearchParams();
    if (course) query.append('course', course);
    if (className) query.append('class_name', className);
    return query.toString() ? `?${query.toString()}` : '';
  },

  reset() {
    this.clearUser();
    this.dashboard.allStudents = [];
    this.dashboard.selectedStudentId = null;
    this.dashboard.currentViewedStudent = null;
    this.dashboard.filters = null;
    this.dashboard.currentFilter = { course: '', className: '' };
    this.ui.chartInstances = {};
    this.ui.notifications = [];
    this._notifyListeners('reset');
  },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppState;
}
