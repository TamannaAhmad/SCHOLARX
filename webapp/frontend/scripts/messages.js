import messagesAPI from '../src/api/messages.js';
import { showError, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    const errorContainer = document.getElementById('error-container');
    const messagesContainer = document.getElementById('messages-container');
    const incomingTab = document.getElementById('incoming-tab');
    const outgoingTab = document.getElementById('outgoing-tab');
    
    let currentTab = 'incoming';
    let incomingRequests = [];
    let outgoingRequests = [];

    function showErrorMsg(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            errorContainer.style.backgroundColor = '#fef2f2';
            errorContainer.style.border = '1px solid #fecaca';
            errorContainer.style.borderRadius = '0.5rem';
            errorContainer.style.padding = '0.75rem 1rem';
            errorContainer.style.color = '#dc2626';
        }
        console.error(message);
    }

    function hideError() {
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString();
    }

    function renderIncomingRequests(requests) {
        if (!requests || requests.length === 0) {
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>No Join Requests</h3>
                    <p>You haven't received any join requests yet.</p>
                </div>
            `;
            return;
        }

        messagesContainer.innerHTML = requests.map(request => {
            const status = request.status || 'pending';
            const statusClass = status === 'approved' ? 'status-approved' : 
                              status === 'rejected' ? 'status-rejected' : 'status-pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            const itemClass = request.is_read ? 'message-item' : 'message-item unread';
            
            const requesterName = request.requester_name || request.requester?.full_name || 'Unknown User';
            const requesterUsn = request.requester_usn || request.requester?.usn || '';
            const projectName = request.project?.title || request.group?.name || 'Unknown';
            const projectType = request.project ? 'project' : 'study-group';
            const projectId = (
                request.project?.project_id ??
                request.project?.id ??
                request.project_id ??
                request.project?.pk ??
                ''
            );
            const groupId = (
                request.group?.group_id ??
                request.group?.id ??
                request.group_id ??
                request.group?.pk ??
                ''
            );
            const viewLink = projectType === 'project'
                ? (projectId ? `project-view.html?id=${projectId}` : null)
                : (groupId ? `study-group-view.html?id=${groupId}` : null);
            
            const requestId = request.request_id || request.id;
            const viewProfileBtn = requesterUsn ? `
                <a href="/userprofile.html?usn=${encodeURIComponent(requesterUsn)}" class="btn-view-profile" target="_blank">
                    View Profile
                </a>
            ` : '';
            
            const actionsHtml = status === 'pending' ? `
                <div class="message-actions">
                    ${viewProfileBtn}
                    <button class="btn-approve" onclick="approveRequest(${requestId})">
                        Approve
                    </button>
                    <button class="btn-reject" onclick="rejectRequest(${requestId})">
                        Reject
                    </button>
                </div>
            ` : viewProfileBtn ? `
                <div class="message-actions">
                    ${viewProfileBtn}
                </div>
            ` : '';

            return `
                <div class="${itemClass}" id="message-${request.id}">
                    <div class="message-header">
                        <div class="message-info">
                            <div class="message-title">
                                ${requesterName}${requesterUsn ? ` (${requesterUsn})` : ''} wants to join 
                                ${viewLink ? `<a href="${viewLink}" style="color: #2563EB; text-decoration: none;">${projectName}</a>` : projectName}
                            </div>
                            <div class="message-meta">
                                ${formatDate(request.created_at)} • ${projectType === 'project' ? 'Project' : 'Study Group'}
                            </div>
                        </div>
                        <span class="message-status ${statusClass}">${statusText}</span>
                    </div>
                    ${request.message ? `
                        <div class="message-body">
                            <div class="message-text">${escapeHtml(request.message)}</div>
                        </div>
                    ` : ''}
                    ${actionsHtml}
                </div>
            `;
        }).join('');
    }

    function renderOutgoingRequests(requests) {
        if (!requests || requests.length === 0) {
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>No Requests Sent</h3>
                    <p>You haven't sent any join requests yet.</p>
                </div>
            `;
            return;
        }

        messagesContainer.innerHTML = requests.map(request => {
            const status = request.status || 'pending';
            const statusClass = status === 'approved' ? 'status-approved' : 
                              status === 'rejected' ? 'status-rejected' : 'status-pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            const itemClass = request.is_read ? 'message-item' : 'message-item unread';
            
            const projectName = request.project?.title || request.group?.name || 'Unknown';
            const projectType = request.project ? 'project' : 'study-group';
            const projectId = (
                request.project?.project_id ??
                request.project?.id ??
                request.project_id ??
                request.project?.pk ??
                ''
            );
            const groupId = (
                request.group?.group_id ??
                request.group?.id ??
                request.group_id ??
                request.group?.pk ??
                ''
            );
            const viewLink = projectType === 'project' ? 
                `project-view.html?id=${projectId}` : 
                `study-group-view.html?id=${groupId}`;

            return `
                <div class="${itemClass}" id="message-${request.id}">
                    <div class="message-header">
                        <div class="message-info">
                            <div class="message-title">
                                Request to join <a href="${viewLink}" style="color: #2563EB; text-decoration: none;">${projectName}</a>
                            </div>
                            <div class="message-meta">
                                ${formatDate(request.created_at)} • ${projectType === 'project' ? 'Project' : 'Study Group'}
                            </div>
                        </div>
                        <span class="message-status ${statusClass}">${statusText}</span>
                    </div>
                    ${request.message ? `
                        <div class="message-body">
                            <div class="message-text">${escapeHtml(request.message)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function loadIncomingRequests() {
        try {
            hideError();
            messagesContainer.innerHTML = '<div class="loading-message">Loading requests...</div>';
            
            const data = await messagesAPI.getIncomingRequests();
            incomingRequests = Array.isArray(data) ? data : (data.results || data.requests || []);
            
            renderIncomingRequests(incomingRequests);
        } catch (error) {
            console.error('Error loading incoming requests:', error);
            const errorMsg = handleAPIError(error, 'Failed to load join requests. Please try again.');
            showErrorMsg(errorMsg);
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>Error Loading Requests</h3>
                    <p>${errorMsg}</p>
                </div>
            `;
        }
    }

    async function loadOutgoingRequests() {
        try {
            hideError();
            messagesContainer.innerHTML = '<div class="loading-message">Loading your requests...</div>';
            
            const data = await messagesAPI.getOutgoingRequests();
            outgoingRequests = Array.isArray(data) ? data : (data.results || data.requests || []);
            
            renderOutgoingRequests(outgoingRequests);
        } catch (error) {
            console.error('Error loading outgoing requests:', error);
            const errorMsg = handleAPIError(error, 'Failed to load your requests. Please try again.');
            showErrorMsg(errorMsg);
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>Error Loading Requests</h3>
                    <p>${errorMsg}</p>
                </div>
            `;
        }
    }

    // Global functions for button onclick handlers
    window.approveRequest = async function(requestId) {
        try {
            hideError();
            const button = event.target;
            button.disabled = true;
            button.textContent = 'Approving...';
            
            await messagesAPI.approveRequest(requestId);
            
            // Show success notification
            if (errorContainer) {
                errorContainer.textContent = 'Request approved successfully!';
                errorContainer.style.display = 'block';
                errorContainer.style.backgroundColor = '#d1fae5';
                errorContainer.style.border = '1px solid #10b981';
                errorContainer.style.borderRadius = '0.5rem';
                errorContainer.style.padding = '0.75rem 1rem';
                errorContainer.style.color = '#065f46';
                setTimeout(() => hideError(), 3000);
            }
            
            // Reload requests
            if (currentTab === 'incoming') {
                await loadIncomingRequests();
            }
        } catch (error) {
            console.error('Error approving request:', error);
            const errorMsg = handleAPIError(error, 'Failed to approve request. Please try again.');
            showErrorMsg(errorMsg);
            const button = event.target;
            button.disabled = false;
            button.textContent = 'Approve';
        }
    };

    window.rejectRequest = async function(requestId) {
        if (!confirm('Are you sure you want to reject this request?')) {
            return;
        }
        
        try {
            hideError();
            const button = event.target;
            button.disabled = true;
            button.textContent = 'Rejecting...';
            
            await messagesAPI.rejectRequest(requestId);
            
            // Show success notification
            if (errorContainer) {
                errorContainer.textContent = 'Request rejected.';
                errorContainer.style.display = 'block';
                errorContainer.style.backgroundColor = '#fee2e2';
                errorContainer.style.border = '1px solid #ef4444';
                errorContainer.style.borderRadius = '0.5rem';
                errorContainer.style.padding = '0.75rem 1rem';
                errorContainer.style.color = '#991b1b';
                setTimeout(() => hideError(), 3000);
            }
            
            // Reload requests
            if (currentTab === 'incoming') {
                await loadIncomingRequests();
            }
        } catch (error) {
            console.error('Error rejecting request:', error);
            const errorMsg = handleAPIError(error, 'Failed to reject request. Please try again.');
            showErrorMsg(errorMsg);
            const button = event.target;
            button.disabled = false;
            button.textContent = 'Reject';
        }
    };

    // Tab switching
    incomingTab.addEventListener('click', () => {
        currentTab = 'incoming';
        incomingTab.classList.add('active');
        outgoingTab.classList.remove('active');
        loadIncomingRequests();
    });

    outgoingTab.addEventListener('click', () => {
        currentTab = 'outgoing';
        outgoingTab.classList.add('active');
        incomingTab.classList.remove('active');
        loadOutgoingRequests();
    });

    // Load initial tab
    loadIncomingRequests();
});

