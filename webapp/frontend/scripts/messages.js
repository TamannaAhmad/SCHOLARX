import messagesAPI from '../src/api/messages.js';
import { showError, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    const errorContainer = document.getElementById('error-container');
    const messagesContainer = document.getElementById('messages-container');
    const incomingTab = document.getElementById('incoming-tab');
    const outgoingTab = document.getElementById('outgoing-tab');
    
    let currentTab = 'incoming';
    let currentType = 'requests'; // 'requests' or 'invitations'
    let incomingRequests = [];
    let outgoingRequests = [];
    let incomingInvitations = [];
    let sentInvitations = [];

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
                    <h3>No Incoming Messages</h3>
                    <p>You don't have any incoming messages yet.</p>
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
            
            // For leave notifications, extract the leaver's info from the message
            let displayName = request.requester_name || request.requester?.full_name || 'Unknown User';
            let displayUsn = request.requester_usn || request.requester?.usn || '';
            let isLeaveNotification = request.request_type === 'member_left';
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
            const viewProfileBtn = displayUsn ? `
                <a href="/userprofile.html?usn=${encodeURIComponent(displayUsn)}" class="btn-view-profile" target="_blank">
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

            // Construct the appropriate message based on the request type
            let message = '';
            
            // Check if this is a leave notification
            if (request.request_type && (request.request_type === 'project_leave' || request.request_type === 'study_group_leave')) {
                isLeaveNotification = true;
                // Use the structured data from the API response
                displayName = request.user_name || 'A user';
                displayUsn = request.user_usn || request.user || '';
                message = `${escapeHtml(displayName)}${displayUsn ? ` (${displayUsn})` : ''} has left`;
            } else {
                // Regular join request
                message = `${escapeHtml(displayName)}${displayUsn ? ` (${displayUsn})` : 'A user'} wants to join`;
            }

            return `
                <div class="${itemClass}" id="message-${request.id}">
                    <div class="message-header">
                        <div class="message-info">
                            <div class="message-title">
                                ${message} ${viewLink ? `<a href="${viewLink}" style="color: #2563EB; text-decoration: none;">${projectName}</a>` : projectName}
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
                    ${!isLeaveNotification ? actionsHtml : ''}
                </div>
            `;
        }).join('');
    }

    function renderOutgoingRequests(requests) {
        if (!requests || requests.length === 0) {
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>No Outgoing Messages</h3>
                    <p>You don't have any outgoing messages yet.</p>
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

    // Update tab styles
    function updateTabStyles(activeTab) {
        // Reset both tabs first
        incomingTab.style.borderBottom = '3px solid transparent';
        incomingTab.style.color = '#6b7280';
        incomingTab.classList.remove('active');
        
        outgoingTab.style.borderBottom = '3px solid transparent';
        outgoingTab.style.color = '#6b7280';
        outgoingTab.classList.remove('active');
        
        // Set active tab
        if (activeTab === 'incoming') {
            incomingTab.style.borderBottom = '3px solid #2563EB';
            incomingTab.style.color = '#2563EB';
            incomingTab.classList.add('active');
        } else {
            outgoingTab.style.borderBottom = '3px solid #2563EB';
            outgoingTab.style.color = '#2563EB';
            outgoingTab.classList.add('active');
        }
    }

    // Tab switching
    incomingTab.addEventListener('click', () => {
        if (currentTab === 'incoming') return; // Skip if already active
        currentTab = 'incoming';    // Set initial tab state
        incomingTab.classList.remove('active');
        outgoingTab.classList.remove('active');
        updateTabStyles('incoming');
        if (currentType === 'requests') {
            loadIncomingRequests();
        } else {
            loadIncomingInvitations();
        }
    });

    outgoingTab.addEventListener('click', () => {
        if (currentTab === 'outgoing') return; // Skip if already active
        currentTab = 'outgoing';
        updateTabStyles('outgoing');
        if (currentType === 'requests') {
            loadOutgoingRequests();
        } else {
            loadSentInvitations();
        }
    });

    // Toggle between requests and invitations
    function toggleMessageType(type) {
        currentType = type;
        
        // Update active state of type toggle buttons
        const requestsBtn = document.getElementById('toggle-requests');
        const invitationsBtn = document.getElementById('toggle-invitations');
        
        if (type === 'requests') {
            requestsBtn.classList.add('active');
            requestsBtn.style.background = '#2563EB';
            requestsBtn.style.color = 'white';
            invitationsBtn.classList.remove('active');
            invitationsBtn.style.background = '#e5e7eb';
            invitationsBtn.style.color = '#4b5563';
        } else {
            requestsBtn.classList.remove('active');
            requestsBtn.style.background = '#e5e7eb';
            requestsBtn.style.color = '#4b5563';
            invitationsBtn.classList.add('active');
            invitationsBtn.style.background = '#2563EB';
            invitationsBtn.style.color = 'white';
        }
        
        if (currentTab === 'incoming') {
            if (type === 'requests') {
                loadIncomingRequests();
            } else {
                loadIncomingInvitations();
            }
        } else {
            if (type === 'requests') {
                loadOutgoingRequests();
            } else {
                loadSentInvitations();
            }
        }
    }

    // Load incoming invitations
    async function loadIncomingInvitations() {
        try {
            hideError();
            messagesContainer.innerHTML = '<div class="loading-message">Loading invitations...</div>';
            
            const data = await messagesAPI.getIncomingInvitations();
            incomingInvitations = Array.isArray(data) ? data : (data.results || data.invitations || []);
            
            if (incomingInvitations.length === 0) {
                messagesContainer.innerHTML = `
                    <div class="no-messages">
                        <h3>No Invitations</h3>
                        <p>You don't have any pending invitations.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="message-list">
                    ${incomingInvitations.map(invite => {
                        const isProject = invite.request_type === 'project';
                        const entity = isProject ? invite.project : invite.group;
                        const entityName = entity?.title || entity?.name || 'Unknown';
                        const entityType = isProject ? 'Project' : 'Study Group';
                        const entityId = isProject 
                            ? (entity?.project_id || '') 
                            : (entity?.group_id || '');
                        const entityLink = isProject 
                            ? `project-view.html?id=${entityId}` 
                            : `group-view.html?id=${entityId}`;
                        
                        const status = invite.status || 'pending';
                        const statusClass = status === 'accepted' ? 'status-approved' : 
                                          status === 'declined' ? 'status-rejected' : 'status-pending';
                        const statusText = status.charAt(0).toUpperCase() + status.slice(1);
                        
                        const itemClass = invite.is_read ? 'message-item' : 'message-item unread';
                        const viewProfileBtn = invite.inviter_usn ? `
                            <a href="/userprofile.html?usn=${encodeURIComponent(invite.inviter_usn)}" class="btn-view-profile" target="_blank">
                                View Profile
                            </a>
                        ` : '';
                        
                        const actionsHtml = status === 'pending' ? `
                            <div class="message-actions">
                                ${viewProfileBtn}
                                <button class="btn-approve" onclick="acceptInvitation('${invite.invite_id || invite.id}')">
                                    Accept
                                </button>
                                <button class="btn-reject" onclick="rejectInvitation('${invite.invite_id || invite.id}')">
                                    Decline
                                </button>
                            </div>
                        ` : viewProfileBtn ? `
                            <div class="message-actions">
                                ${viewProfileBtn}
                            </div>
                        ` : '';

                        return `
                        <div class="${itemClass}" id="invite-${invite.invite_id || invite.id}">
                            <div class="message-header">
                                <div class="message-info">
                                    <div class="message-title">
                                        ${escapeHtml(invite.inviter_name || 'Unknown User')}${invite.inviter_usn ? ` (${invite.inviter_usn})` : ''} invited you to join 
                                        <a href="${entityLink}" style="color: #2563EB; text-decoration: none;">${escapeHtml(entityName)}</a>
                                    </div>
                                    <div class="message-meta">
                                        ${formatDate(invite.updated_at)} • ${entityType}
                                    </div>
                                </div>
                                <span class="message-status ${statusClass}">${statusText}</span>
                            </div>
                            ${invite.message ? `
                                <div class="message-body">
                                    <div class="message-text">${escapeHtml(invite.message)}</div>
                                </div>
                            ` : ''}
                            <div class="message-actions">
                                ${viewProfileBtn}
                                <button class="btn-approve" onclick="acceptInvitation('${invite.invite_id || invite.id}')">
                                    Accept
                                </button>
                                <button class="btn-reject" onclick="rejectInvitation('${invite.invite_id || invite.id}')">
                                    Decline
                                </button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
            messagesContainer.innerHTML = html;
        } catch (error) {
            console.error('Error loading invitations:', error);
            const errorMsg = handleAPIError(error, 'Failed to load invitations. Please try again.');
            showErrorMsg(errorMsg);
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>Error Loading Invitations</h3>
                    <p>${errorMsg}</p>
                </div>
            `;
        }
    }

    // Load sent invitations
    async function loadSentInvitations() {
        try {
            hideError();
            messagesContainer.innerHTML = '<div class="loading-message">Loading sent invitations...</div>';
            
            const data = await messagesAPI.getSentInvitations();
            sentInvitations = Array.isArray(data) ? data : (data.results || data.invitations || []);
            
            if (sentInvitations.length === 0) {
                messagesContainer.innerHTML = `
                    <div class="no-messages">
                        <h3>No Sent Invitations</h3>
                        <p>You haven't sent any invitations yet.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="message-list">
                    ${sentInvitations.map(invite => {
                        const isProject = invite.request_type === 'project';
                        const entity = isProject ? invite.project : invite.group;
                        const entityName = entity?.title || entity?.name || 'Unknown';
                        const entityType = isProject ? 'Project' : 'Study Group';
                        const entityId = isProject 
                            ? (entity?.project_id || '')
                            : (entity?.group_id || '');
                        const entityLink = isProject 
                            ? `project-view.html?id=${entityId}`
                            : `group-view.html?id=${entityId}`;
                            
                        const status = invite.status || 'pending';
                        const statusClass = status === 'accepted' ? 'status-approved' : 
                                          status === 'declined' ? 'status-rejected' : 'status-pending';
                        const statusText = status.charAt(0).toUpperCase() + status.slice(1);
                        
                        const itemClass = 'message-item';
                        const viewProfileBtn = invite.invitee_usn ? `
                            <a href="/userprofile.html?usn=${encodeURIComponent(invite.invitee_usn)}" class="btn-view-profile" target="_blank">
                                View Profile
                            </a>
                        ` : '';

                        // Determine the message based on the status
                        let message = '';
                        if (invite.is_leave_notification) {
                            message = `${escapeHtml(invite.leaver_name || 'A member')}${invite.leaver_usn ? ` (${invite.leaver_usn})` : ''} left the ${entityType.toLowerCase()}`;
                        } else if (status === 'declined') {
                            message = `${escapeHtml(invite.invitee_name || 'The user')}${invite.invitee_usn ? ` (${invite.invitee_usn})` : ''} declined your invitation to join`;
                        } else if (status === 'accepted') {
                            message = `${escapeHtml(invite.invitee_name || 'The user')}${invite.invitee_usn ? ` (${invite.invitee_usn})` : ''} accepted your invitation to join`;
                        } else {
                            message = `You invited ${escapeHtml(invite.invitee_name || 'a user')}${invite.invitee_usn ? ` (${invite.invitee_usn})` : ''} to join`;
                        }

                        return `
                        <div class="${itemClass}" id="sent-invite-${invite.invite_id || invite.id}">
                            <div class="message-header">
                                <div class="message-info">
                                    <div class="message-title">
                                        ${message} ${!invite.is_leave_notification ? `<a href="${entityLink}" style="color: #2563EB; text-decoration: none;">${escapeHtml(entityName)}</a>` : ''}
                                    </div>
                                    <div class="message-meta">
                                        ${formatDate(invite.created_at)} • ${entityType}
                                    </div>
                                </div>
                                <span class="message-status ${statusClass}">${statusText}</span>
                            </div>
                            ${invite.message ? `
                                <div class="message-body">
                                    <div class="message-text">${escapeHtml(invite.message)}</div>
                                </div>
                            ` : ''}
                            ${viewProfileBtn ? `
                                <div class="message-actions">
                                    ${viewProfileBtn}
                                </div>
                            ` : ''}
                        </div>`;
                    }).join('')}
                </div>
            `;
            messagesContainer.innerHTML = html;
        } catch (error) {
            console.error('Error loading sent invitations:', error);
            const errorMsg = handleAPIError(error, 'Failed to load sent invitations. Please try again.');
            showErrorMsg(errorMsg);
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>Error Loading Sent Invitations</h3>
                    <p>${errorMsg}</p>
                </div>
            `;
        }
    }

    // Show success message in top right corner
    function showSuccessMessage(message) {
        // Create notification container if it doesn't exist
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.position = 'fixed';
            notificationContainer.style.top = '20px';
            notificationContainer.style.right = '20px';
            notificationContainer.style.zIndex = '1000';
            document.body.appendChild(notificationContainer);
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.style.backgroundColor = '#10B981';
        notification.style.color = 'white';
        notification.style.padding = '12px 24px';
        notification.style.borderRadius = '4px';
        notification.style.marginBottom = '10px';
        notification.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        notification.style.animation = 'slideIn 0.3s ease-out';
        notification.textContent = message;

        // Add to container
        notificationContainer.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    }

    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Global functions for invitation actions
    window.acceptInvitation = async function(inviteId) {
        if (!inviteId) return;
        
        try {
            const response = await messagesAPI.respondToInvitation(inviteId, true);
            // Show success message
            const message = response.message || 'Invitation accepted successfully!';
            showSuccessMessage(message);
            
            // Reload the list to show updated status
            loadIncomingInvitations();
        } catch (error) {
            console.error('Error accepting invitation:', error);
            alert(handleAPIError(error, 'Failed to accept invitation. Please try again.'));
        }
    };

    window.rejectInvitation = async function(inviteId) {
        if (!confirm('Are you sure you want to decline this invitation?')) {
            return;
        }
        
        try {
            hideError();
            const button = event.target;
            button.disabled = true;
            button.textContent = 'Declining...';
            
            await messagesAPI.respondToInvitation(inviteId, false);
            
            // Show success notification
            if (errorContainer) {
                errorContainer.textContent = 'Invitation declined.';
                errorContainer.style.display = 'block';
                errorContainer.style.backgroundColor = '#fee2e2';
                errorContainer.style.border = '1px solid #ef4444';
                errorContainer.style.borderRadius = '0.5rem';
                errorContainer.style.padding = '0.75rem 1rem';
                errorContainer.style.color = '#991b1b';
                setTimeout(() => hideError(), 3000);
            }
            
            // Reload invitations
            loadIncomingInvitations();
        } catch (error) {
            console.error('Error declining invitation:', error);
            const errorMsg = handleAPIError(error, 'Failed to decline invitation. Please try again.');
            showErrorMsg(errorMsg);
            const button = event.target;
            button.disabled = false;
            button.textContent = 'Decline';
        }
    };

    // Show leave confirmation modal
    window.showLeaveConfirmation = function(groupId, isProject = false) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            padding: 20px;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: white;
            padding: 24px;
            border-radius: 8px;
            width: 100%;
            max-width: 450px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Leave ' + (isProject ? 'Project' : 'Group');
        title.style.marginTop = '0';
        title.style.marginBottom = '16px';

        const messageLabel = document.createElement('label');
        messageLabel.textContent = 'Leave a message (optional)';
        messageLabel.style.display = 'block';
        messageLabel.style.marginBottom = '8px';
        messageLabel.style.fontWeight = '500';

        const messageInput = document.createElement('textarea');
        messageInput.placeholder = 'Let others know why you\'re leaving...';
        messageInput.style.cssText = `
            width: 100%;
            min-height: 100px;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            margin-bottom: 20px;
            font-family: inherit;
            resize: vertical;
        `;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '12px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;

        const leaveBtn = document.createElement('button');
        leaveBtn.textContent = 'Leave';
        leaveBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #ef4444;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;

        cancelBtn.onclick = () => document.body.removeChild(modal);
        
        leaveBtn.onclick = async () => {
            const message = messageInput.value.trim();
            try {
                leaveBtn.disabled = true;
                leaveBtn.textContent = 'Leaving...';
                
                const endpoint = isProject 
                    ? `/api/projects/${groupId}/leave/`
                    : `/api/projects/groups/${groupId}/leave/`;
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken'),
                    },
                    body: JSON.stringify({ message }),
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error('Failed to leave ' + (isProject ? 'project' : 'group'));
                }

                // Show success message
                showSuccessMessage(`You have left the ${isProject ? 'project' : 'group'} successfully.`);
                
                // Close modal and refresh the page or update UI as needed
                document.body.removeChild(modal);
                window.location.reload();
                
            } catch (error) {
                console.error('Error leaving:', error);
                showErrorMsg(`Failed to leave ${isProject ? 'project' : 'group'}. Please try again.`);
                leaveBtn.disabled = false;
                leaveBtn.textContent = 'Leave';
            }
        };

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(leaveBtn);

        modalContent.appendChild(title);
        modalContent.appendChild(messageLabel);
        modalContent.appendChild(messageInput);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Focus the message input
        messageInput.focus();
    };

    // Helper function to get CSRF token from cookies
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    window.rejectInvitation = async function(inviteId) {
        if (!confirm('Are you sure you want to decline this invitation?')) {
            return;
        }
        
        try {
            hideError();
            const button = event.target;
            button.disabled = true;
            button.textContent = 'Declining...';
            
            await messagesAPI.respondToInvitation(inviteId, false);
            
            // Show success notification
            if (errorContainer) {
                errorContainer.textContent = 'Invitation declined.';
                errorContainer.style.display = 'block';
                errorContainer.style.backgroundColor = '#fee2e2';
                errorContainer.style.border = '1px solid #ef4444';
                errorContainer.style.borderRadius = '0.5rem';
                errorContainer.style.padding = '0.75rem 1rem';
                errorContainer.style.color = '#991b1b';
                setTimeout(() => hideError(), 3000);
            }
            
            // Reload invitations
            loadIncomingInvitations();
        } catch (error) {
            console.error('Error declining invitation:', error);
            const errorMsg = handleAPIError(error, 'Failed to decline invitation. Please try again.');
            showErrorMsg(errorMsg);
            const button = event.target;
            button.disabled = false;
            button.textContent = 'Decline';
        }
    };

    // Load initial tab
    loadIncomingRequests();
    
    // Add event listeners for request/invitation toggles if they exist
    const requestToggle = document.getElementById('toggle-requests');
    const invitationToggle = document.getElementById('toggle-invitations');
    
    if (requestToggle && invitationToggle) {
        // Set initial active state
        if (currentType === 'requests') {
            requestToggle.classList.add('active');
            invitationToggle.classList.remove('active');
        } else {
            requestToggle.classList.remove('active');
            invitationToggle.classList.add('active');
        }
        
        requestToggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMessageType('requests');
        });
        
        invitationToggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMessageType('invitations');
        });
    }
});

