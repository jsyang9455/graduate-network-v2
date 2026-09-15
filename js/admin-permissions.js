/**
 * System admin — role × menu permission matrix (focus: company_approval).
 * REQ-JOB-007 / REQ-IAM-008
 */
document.addEventListener('DOMContentLoaded', async function () {
  if (!auth.requireAuth()) return;
  const user = auth.getCurrentUser();
  if (!auth.isSystemAdmin(user)) {
    alert('시스템 관리자만 접근할 수 있습니다.');
    window.location.href = 'dashboard.html';
    return;
  }

  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = user.name;

  const ROLE_ORDER = ['school_admin', 'teacher', 'student', 'graduate', 'company'];
  const tbody = document.getElementById('permTableBody');
  const statusEl = document.getElementById('permStatus');

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#b91c1c' : '#166534';
  }

  async function load() {
    setStatus('불러오는 중…');
    try {
      const data = await api.roles.list();
      const roles = data.roles || [];
      const byCode = Object.fromEntries(roles.map((r) => [r.code, r]));

      tbody.innerHTML = ROLE_ORDER.map((code) => {
        const role = byCode[code];
        if (!role) return '';
        const actions = (role.permissions && role.permissions.company_approval) || [];
        const canRead = actions.includes('read') || actions.includes('write') || actions.includes('manage');
        const canWrite = actions.includes('write') || actions.includes('manage');
        const label = (window.RoleLabels && RoleLabels.displayRoleLabel(code)) || role.name || code;
        return `<tr data-role="${code}">
          <td><strong>${label}</strong><br><span style="color:#6b7280;font-size:0.8rem;">${code}</span></td>
          <td style="text-align:center;">
            <input type="checkbox" class="perm-read" data-role="${code}" ${canRead ? 'checked' : ''}>
          </td>
          <td style="text-align:center;">
            <input type="checkbox" class="perm-write" data-role="${code}" ${canWrite ? 'checked' : ''}>
          </td>
          <td>
            <button type="button" class="btn btn-primary btn-small" onclick="saveRolePerm('${code}')">저장</button>
          </td>
        </tr>`;
      }).join('');

      setStatus('기본값: 학교 관리자·시스템 관리자만 기업 승인 가능. 아래에서 역할별 부여/회수.');
    } catch (e) {
      console.error(e);
      setStatus(e.message || '권한 목록을 불러오지 못했습니다.', true);
      tbody.innerHTML = '<tr><td colspan="4">로드 실패</td></tr>';
    }
  }

  window.saveRolePerm = async function (code) {
    const row = tbody.querySelector(`tr[data-role="${code}"]`);
    if (!row) return;
    const write = row.querySelector('.perm-write')?.checked;
    const read = row.querySelector('.perm-read')?.checked || write;
    let actions = [];
    if (write) actions = ['write', 'read', 'apply'];
    else if (read) actions = ['read', 'apply'];

    try {
      setStatus(`${code} 저장 중…`);
      await api.roles.updatePermissions(code, { company_approval: actions });
      setStatus(`${(window.RoleLabels && RoleLabels.displayRoleLabel(code)) || code} 기업 승인 권한이 저장되었습니다.`);
      await load();
    } catch (e) {
      setStatus(e.message || '저장 실패', true);
    }
  };

  await load();
});
