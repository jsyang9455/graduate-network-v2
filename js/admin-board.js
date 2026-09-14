// 전역 변수
let currentUser = null;
let posts = [];
let editingPostId = null;

document.addEventListener('DOMContentLoaded', function() {
    auth.requireAuth();
    currentUser = auth.getCurrentUser();
    if (!currentUser || !auth.isStaffAdmin(currentUser)) {
        alert('관리자만 접근할 수 있습니다.');
        window.location.href = 'dashboard.html';
        return;
    }
    document.getElementById('userName').textContent = currentUser.name;
    loadPosts();
    document.getElementById('searchPost').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchPosts();
    });
});

async function loadPosts() {
    const tbody = document.getElementById('postsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b7280;">불러오는 중...</td></tr>';
    try {
        const data = await api.get('/posts?limit=200');
        posts = data.posts || [];
        displayPosts(posts);
    } catch (err) {
        console.error('게시글 로드 실패:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#ef4444;">게시글을 불러올 수 없습니다.</td></tr>';
    }
}

function displayPosts(postList) {
    const tbody = document.getElementById('postsTableBody');
    if (postList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:40px;">게시글이 없습니다.</td></tr>';
        return;
    }
    const sorted = [...postList].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });
    tbody.innerHTML = sorted.map((post, index) => {
        const date = new Date(post.created_at).toLocaleDateString('ko-KR');
        const pinBadge = post.is_pinned ? '<span class="badge badge-important">중요</span> ' : '';
        return `<tr ${post.is_pinned ? 'class="important-row"' : ''}>
                <td>${sorted.length - index}</td>
                <td><span class="badge badge-category">${post.category || '-'}</span></td>
                <td style="text-align:left;">${pinBadge}${post.title}</td>
                <td>${post.author_name || '-'}</td>
                <td>${post.views_count || 0}</td>
                <td>${date}</td>
                <td>
                    <button class="btn-small btn-primary" onclick="editPost(${post.id})">수정</button>
                    <button class="btn-small btn-danger" onclick="deletePost(${post.id})">삭제</button>
                </td></tr>`;
    }).join('');
}

function openAddPostModal() {
    editingPostId = null;
    document.getElementById('postModalTitle').textContent = '게시글 등록';
    document.getElementById('postForm').reset();
    document.getElementById('postId').value = '';
    document.getElementById('postModal').style.display = 'block';
}
window.openAddPostModal = openAddPostModal;

function editPost(postId) {
    const post = posts.find(p => p.id == postId);
    if (!post) return;
    editingPostId = postId;
    document.getElementById('postModalTitle').textContent = '게시글 수정';
    document.getElementById('postId').value = post.id;
    document.getElementById('postCategory').value = post.category || '';
    document.getElementById('postTitle').value = post.title;
    document.getElementById('postContent').value = post.content;
    document.getElementById('postImportant').checked = post.is_pinned || false;
    document.getElementById('postModal').style.display = 'block';
}
window.editPost = editPost;

async function savePost(event) {
    event.preventDefault();
    const postData = {
        category: document.getElementById('postCategory').value,
        title: document.getElementById('postTitle').value,
        content: document.getElementById('postContent').value,
        is_pinned: document.getElementById('postImportant').checked
    };
    try {
        if (editingPostId) {
            await api.put(`/posts/${editingPostId}`, postData);
            alert('게시글이 수정되었습니다.');
        } else {
            await api.post('/posts', postData);
            alert('게시글이 등록되었습니다.');
        }
        closePostModal();
        await loadPosts();
    } catch (err) {
        alert('저장 실패: ' + (err.message || '오류가 발생했습니다.'));
    }
}
window.savePost = savePost;

async function deletePost(postId) {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    try {
        await api.delete(`/posts/${postId}`);
        alert('게시글이 삭제되었습니다.');
        await loadPosts();
    } catch (err) {
        alert('삭제 실패: ' + (err.message || '오류가 발생했습니다.'));
    }
}
window.deletePost = deletePost;

function searchPosts() {
    const q = document.getElementById('searchPost').value.toLowerCase();
    const filtered = posts.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q)
    );
    displayPosts(filtered);
}
window.searchPosts = searchPosts;

function applyFilters() {
    const category = document.getElementById('filterCategory').value;
    const q = document.getElementById('searchPost').value.toLowerCase();
    let filtered = [...posts];
    if (category) filtered = filtered.filter(p => p.category === category);
    if (q) filtered = filtered.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q)
    );
    displayPosts(filtered);
}
window.applyFilters = applyFilters;

function closePostModal() {
    document.getElementById('postModal').style.display = 'none';
    editingPostId = null;
}
window.closePostModal = closePostModal;
