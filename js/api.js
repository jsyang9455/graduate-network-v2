// API Configuration — local API is port 5000 (compose/backend default). Nginx `/api` in production.
// Override: localStorage.jjobb_api_base = 'http://localhost:5050/api' (macOS AirPlay often holds 5000).
const API_BASE_URL = (() => {
  try {
    const override = localStorage.getItem('jjobb_api_base');
    if (override) return override.replace(/\/$/, '');
  } catch (_) { /* ignore */ }
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `http://${hostname}:5000/api`;
  }
  return '/api';
})();

// API Helper Functions
const api = {
  // Get token from localStorage
  getToken() {
    return localStorage.getItem('token');
  },

  // Set token to localStorage
  setToken(token) {
    localStorage.setItem('token', token);
  },

  // Remove token from localStorage
  removeToken() {
    localStorage.removeItem('token');
  },

  // Make authenticated request
  async request(endpoint, options = {}) {
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = (typeof data.error === 'string' ? data.error : data.error?.message) || 'Request failed';
        const detail = data.detail ? `\n상세: ${data.detail}` : '';
        throw new Error(msg + detail);
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  },

  // GET request
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  // POST request
  async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // PUT request
  async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  // PATCH request
  async patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  async uploadFile(file) {
    const token = this.getToken();
    const form = new FormData();
    form.append('file', file);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = (typeof data.error === 'string' ? data.error : data.error?.message) || 'Upload failed';
      throw new Error(msg);
    }
    return data;
  },

  recommendations: {
    async me(limit = 10) {
      return api.get(`/recommendations/me?limit=${limit}`);
    },
    async associated(limit = 10) {
      return api.get(`/recommendations/associated?limit=${limit}`);
    },
    async recompute(body = {}) {
      return api.post('/recommendations/recompute', body);
    },
    async feedback(jobId, event) {
      return api.post('/recommendations/feedback', { job_id: jobId, event });
    },
  },

  fieldTrips: {
    async list() {
      return api.get('/field-trips');
    },
    async get(id) {
      return api.get(`/field-trips/${id}`);
    },
    async apply(id, body) {
      return api.post(`/field-trips/${id}/apply`, body);
    },
    async getReport(id) {
      return api.get(`/field-trips/${id}/report`);
    },
    async saveReport(id, body) {
      return api.put(`/field-trips/${id}/report`, body);
    },
  },

  jobsApi: {
    async scrap(id) {
      return api.post(`/jobs/${id}/scrap`, {});
    },
    async unscrap(id) {
      return api.delete(`/jobs/${id}/scrap`);
    },
    async myScraps() {
      return api.get('/jobs/scraps/me');
    },
  },

  worknet: {
    async status() {
      return api.get('/worknet/status');
    },
  },

  async download(endpoint, { method = 'GET', body, filename } = {}) {
    const token = this.getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      let msg = 'Download failed';
      try {
        const data = await response.json();
        msg = (typeof data.error === 'string' ? data.error : data.error?.message) || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Auth APIs
  auth: {
    async register(userData) {
      return api.post('/auth/register', userData);
    },

    async login(email, password) {
      return api.post('/auth/login', { email, password });
    },

    async getCurrentUser() {
      return api.get('/auth/me');
    },

    async changePassword(currentPassword, newPassword) {
      return api.post('/auth/change-password', { currentPassword, newPassword });
    },

    async permissions() {
      return api.get('/me/permissions');
    },
  },

  schools: {
    async list(includeInactive = false) {
      const q = includeInactive ? '?include_inactive=true' : '';
      return api.get(`/schools${q}`);
    },
    async get(id) {
      return api.get(`/schools/${id}`);
    },
    async create(data) {
      return api.post('/schools', data);
    },
    async update(id, data) {
      return api.patch(`/schools/${id}`, data);
    },
    async departments(schoolId) {
      return api.get(`/schools/${schoolId}/departments`);
    },
  },

  roles: {
    async list() {
      return api.get('/roles');
    },
    async getPermissions(code) {
      return api.get(`/roles/${encodeURIComponent(code)}/permissions`);
    },
    async updatePermissions(code, permissions) {
      return api.put(`/roles/${encodeURIComponent(code)}/permissions`, { permissions });
    },
  },

  // User APIs
  users: {
    async search(params) {
      const queryString = new URLSearchParams(params).toString();
      return api.get(`/users?${queryString}`);
    },

    async getProfile(userId) {
      return api.get(`/users/${userId}`);
    },

    async updateProfile(data) {
      return api.put('/users/profile', data);
    },

    async getGraduateProfile(userId) {
      return api.get(`/users/graduate-profile/${userId}`);
    },

    async updateGraduateProfile(data) {
      return api.put('/users/graduate-profile', data);
    },

    async getCompanyProfile() {
      return api.get('/users/company-profile');
    },

    async updateCompanyProfile(data) {
      return api.put('/users/company-profile', data);
    },

    async listCompanies(params = {}) {
      const queryString = new URLSearchParams(params).toString();
      return api.get(`/users/companies${queryString ? `?${queryString}` : ''}`);
    },

    async setCompanyApproval(userId, data) {
      return api.patch(`/users/${userId}/company-approval`, data);
    },
  },

  // Job APIs
  jobs: {
    async getAll(params) {
      const queryString = new URLSearchParams(params).toString();
      return api.get(`/jobs?${queryString}`);
    },

    async getById(id) {
      return api.get(`/jobs/${id}`);
    },

    async create(jobData) {
      return api.post('/jobs', jobData);
    },

    async update(id, jobData) {
      return api.put(`/jobs/${id}`, jobData);
    },

    async delete(id) {
      return api.delete(`/jobs/${id}`);
    },

    async apply(id, applicationData) {
      return api.post(`/jobs/${id}/apply`, applicationData);
    },

    async getMyApplications() {
      return api.get('/jobs/my/applications');
    },

    async getApplicants(jobId) {
      return api.get(`/jobs/${jobId}/applicants`);
    },

    async getApplication(id) {
      return api.get(`/jobs/applications/${id}`);
    },

    async updateApplicationStatus(id, status) {
      return api.patch(`/jobs/applications/${id}/status`, { status });
    },
  },

  notifications: {
    async list(unreadOnly) {
      const q = unreadOnly ? '?unread=true' : '';
      return api.get(`/notifications${q}`);
    },
    async markRead(id) {
      return api.patch(`/notifications/${id}/read`);
    },
    async markAllRead() {
      return api.post('/notifications/read-all', {});
    },
  },

  resumes: {
    async list(userId) {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
      return api.get(`/resumes${q}`);
    },
    async get(id) {
      return api.get(`/resumes/${id}`);
    },
    async create(data) {
      return api.post('/resumes', data);
    },
    async update(id, data) {
      return api.put(`/resumes/${id}`, data);
    },
    async remove(id) {
      return api.delete(`/resumes/${id}`);
    },
    async setPrimary(id) {
      return api.post(`/resumes/${id}/primary`, {});
    },
    async preview(id) {
      return api.get(`/resumes/${id}/preview`);
    },
    async pdf(id, template_code) {
      return api.download(`/resumes/${id}/pdf?download=1`, {
        method: 'POST',
        body: template_code ? { template_code } : {},
        filename: 'resume.pdf',
      });
    },
  },

  counselingJournals: {
    async list() {
      return api.get('/counseling-journals');
    },
    async stats(params = {}) {
      const q = new URLSearchParams(params).toString();
      return api.get(`/counseling-journals/stats${q ? `?${q}` : ''}`);
    },
    async timeline(studentId) {
      return api.get(`/counseling-journals/timeline/${studentId}`);
    },
    async pdf(id, kind) {
      return api.download(`/counseling-journals/${id}/pdf?download=1`, {
        method: 'POST',
        body: kind ? { kind } : {},
        filename: 'counseling.pdf',
      });
    },
    async docx(id, kind) {
      return api.download(`/counseling-journals/${id}/docx?download=1`, {
        method: 'POST',
        body: kind ? { kind } : {},
        filename: 'counseling.docx',
      });
    },
  },

  files: {
    async download(id, filename) {
      return api.download(`/files/${id}?download=1`, { filename: filename || 'file' });
    },
  },

  // Networking APIs
  networking: {
    async getConnections() {
      return api.get('/networking/connections');
    },

    async getRequests() {
      return api.get('/networking/requests');
    },

    async sendRequest(userId, message) {
      return api.post(`/networking/connect/${userId}`, { message });
    },

    async respondToRequest(requestId, action) {
      return api.put(`/networking/requests/${requestId}`, { action });
    },

    async getMentors(params) {
      const queryString = new URLSearchParams(params).toString();
      return api.get(`/networking/mentors?${queryString}`);
    },

    async requestMentorship(mentorId, notes) {
      return api.post(`/networking/mentorship/${mentorId}`, { notes });
    },

    async getMyMentorships() {
      return api.get('/networking/my-mentorships');
    },
  },

  // Counseling APIs
  counseling: {
    async getSessions() {
      return api.get('/counseling');
    },

    async bookSession(sessionData) {
      return api.post('/counseling', sessionData);
    },

    async updateSession(id, sessionData) {
      return api.put(`/counseling/${id}`, sessionData);
    },

    async cancelSession(id) {
      return api.delete(`/counseling/${id}`);
    },

    async getAvailableSlots(date) {
      return api.get(`/counseling/available-slots?date=${date}`);
    },
  },

  // Certificate APIs
  certificates: {
    async getAll() {
      return api.get('/certificates');
    },

    async request(certificateData) {
      return api.post('/certificates', certificateData);
    },

    async getById(id) {
      return api.get(`/certificates/${id}`);
    },
  },

  // Post APIs
  posts: {
    async getAll(params) {
      const queryString = new URLSearchParams(params).toString();
      return api.get(`/posts?${queryString}`);
    },

    async getById(id) {
      return api.get(`/posts/${id}`);
    },

    async create(postData) {
      return api.post('/posts', postData);
    },

    async update(id, postData) {
      return api.put(`/posts/${id}`, postData);
    },

    async delete(id) {
      return api.delete(`/posts/${id}`);
    },

    async getComments(id) {
      return api.get(`/posts/${id}/comments`);
    },

    async addComment(id, content, parent_id = null) {
      return api.post(`/posts/${id}/comments`, { content, parent_id });
    },

    async like(id) {
      return api.post(`/posts/${id}/like`, {});
    },

    async categories() {
      return api.get('/posts/categories');
    },

    async scrap(id) {
      return api.post(`/posts/${id}/scrap`, {});
    },

    async unscrap(id) {
      return api.delete(`/posts/${id}/scrap`);
    },

    async myScraps() {
      return api.get('/posts/scraps/me');
    },

    async report(id, reason) {
      return api.post(`/posts/${id}/report`, { reason });
    },

    async blind(id, reason) {
      return api.post(`/posts/${id}/blind`, { reason });
    },

    async unblind(id) {
      return api.delete(`/posts/${id}/blind`);
    },

    async reports() {
      return api.get('/posts/reports');
    },
  },
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
