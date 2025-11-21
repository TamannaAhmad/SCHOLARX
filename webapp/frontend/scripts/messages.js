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
        console.log('=== renderIncomingRequests START ===');
        console.log('Requests to render:', requests);
        console.log('Number of requests:', requests ? requests.length : 0);
        
        if (!requests || requests.length === 0) {
            console.log('No requests to render');
            messagesContainer.innerHTML = `
                <div class="no-messages">
                    <h3>No Incoming Messages</h3>
                    <p>You don't have any incoming messages yet.</p>
                </div>
            `;
            return;
        }

        messagesContainer.innerHTML = requests.map((request, idx) => {
            // Check if this is a leave notification based on request_type
            const isLeaveNotification = request.request_type && (request.request_type === 'project_leave' || request.request_type === 'study_group_leave');
            console.log(`Rendering request ${idx}:`, {
                request_type: request.request_type,
                isLeaveNotification: isLeaveNotification,
                has_user_name: !!request.user_name,
                has_requester_name: !!request.requester_name,
                project: request.project?.title,
                group: request.group?.name
            });
            
            const status = request.status || 'pending';
            const statusClass = status === 'approved' ? 'status-approved' : 
                              status === 'rejected' ? 'status-rejected' : 'status-pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            const itemClass = request.is_read ? 'message-item' : 'message-item unread';
            
            // Extract user info based on request type
            let displayName, displayUsn;
            const isInvitation = request.invite_id !== undefined;
            
            if (isLeaveNotification) {
                // For leave requests, use user_name and user_usn
                displayName = request.user_name || 'A user';
                displayUsn = request.user_usn || '';
            } else if (isInvitation) {
                // For invitations, use inviter_name and inviter_usn
                displayName = request.inviter_name || 'A user';
                displayUsn = request.inviter_usn || '';
            } else {
                // For join requests, use requester_name and requester_usn
                displayName = request.requester_name || request.requester?.full_name || 'Unknown User';
                displayUsn = request.requester_usn || request.requester?.usn || '';
            }
            
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
            
            // Get the appropriate ID based on request type
            let requestId;
            let actionFunction = 'approveRequest';
            
            if (isInvitation) {
                requestId = request.invite_id;
                actionFunction = 'respondToInvitation';
            } else if (isLeaveNotification) {
                requestId = null; // Leave requests don't have approve/reject actions
            } else {
                requestId = request.request_id || request.id;
                actionFunction = 'approveRequest';
            }
            
            const viewProfileBtn = displayUsn ? `
                <a href="/userprofile.html?usn=${encodeURIComponent(displayUsn)}" class="btn-view-profile" target="_blank">
                    View Profile
                </a>
            ` : '';
            
            // Only show approve/reject buttons for join requests and invitations
            const showActionButtons = (status === 'pending') && (isInvitation || (!isLeaveNotification && !isInvitation));
            
            const actionsHtml = showActionButtons && requestId ? `
                <div class="message-actions">
                    ${viewProfileBtn}
                    ${isInvitation ? `
                        <button class="btn-approve" onclick="respondToInvitation(${requestId}, true)">
                            Accept
                        </button>
                        <button class="btn-reject" onclick="respondToInvitation(${requestId}, false)">
                            Decline
                        </button>
                    ` : `
                        <button class="btn-approve" onclick="approveRequest(${requestId})">
                            Approve
                        </button>
                        <button class="btn-reject" onclick="rejectRequest(${requestId})">
                            Reject
                        </button>
                    `}
                </div>
            ` : viewProfileBtn ? `
                <div class="message-actions">
                    ${viewProfileBtn}
                </div>
            ` : '';

            // Construct the appropriate message based on the request type
            let message = '';
            if (isLeaveNotification) {
                message = `${escapeHtml(displayName)}${displayUsn ? ` (${displayUsn})` : ''} has left`;
            } else if (isInvitation) {
                message = `${escapeHtml(displayName)}${displayUsn ? ` (${displayUsn})` : ''} invited you to`;
            } else {
                message = `${escapeHtml(displayName)}${displayUsn ? ` (${displayUsn})` : 'A user'} wants to join`;
            }

            return `
                <div class="${itemClass}" id="message-${request.request_id || request.id}">
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
            // Check if this is an invitation or a request
            const isInvitation = 'invite_id' in request;
            const status = request.status || 'pending';
            const statusClass = status === 'approved' ? 'status-approved' : 
                              status === 'rejected' ? 'status-rejected' : 'status-pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            const itemClass = request.is_read ? 'message-item' : 'message-item unread';
            
            const projectName = request.project?.title || request.group?.name || 'Unknown';
            const projectType = request.project ? 'project' : 'study-group';
            let messageContent = '';
            if (isInvitation) {
                const recipientName = request.invitee_name || request.invitee?.full_name || 'a user';
                messageContent = `
                    <div class="message-body">
                        <p>You invited ${escapeHtml(recipientName)} to join this ${projectType}.</p>
                        ${request.message ? `<div class="invitation-message">${escapeHtml(request.message)}</div>` : ''}
                        <div class="message-meta">Sent on ${formatDate(request.sent_at || request.created_at)}</div>
                    </div>
                `;
            } else {
                messageContent = `
                    <div class="message-body">
                        ${request.message ? `<div class="message-text">${escapeHtml(request.message)}</div>` : ''}
                        <div class="message-meta">Sent on ${formatDate(request.created_at)}</div>
                    </div>
                `;
            }
            
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
                    ${messageContent}
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
            console.log('=== loadIncomingRequests START ===');
            const allRequests = await messagesAPI.getIncomingRequests();
            console.log('Raw API response from /messages/incoming/:', allRequests);
            console.log('Response type:', typeof allRequests);
            console.log('Is array?', Array.isArray(allRequests));
            
            // The API returns a combined list of join and leave requests
            // Separate them based on request_type
            const requestsList = Array.isArray(allRequests) ? allRequests : allRequests.data || [];
            console.log('Extracted requests list:', requestsList);
            console.log('Number of requests:', requestsList.length);
            
            incomingRequests = requestsList.map((r, index) => {
                const isLeaveRequest = r.request_type && (r.request_type === 'project_leave' || r.request_type === 'study_group_leave');
                console.log(`Request ${index}:`, {
                    request_id: r.request_id,
                    request_type: r.request_type,
                    isLeaveRequest: isLeaveRequest,
                    user_name: r.user_name,
                    user_usn: r.user_usn,
                    requester_name: r.requester_name,
                    requester_usn: r.requester_usn
                });
                return {
                    ...r,
                    is_leave_request: isLeaveRequest,
                    is_join_request: !isLeaveRequest
                };
            });
            
            console.log('Processed incoming requests:', incomingRequests);
            console.log('=== loadIncomingRequests END ===');
            renderIncomingRequests(incomingRequests);
            hideError();
        } catch (error) {
            console.error('Error in loadIncomingRequests:', error);
            showErrorMsg(error.message || 'Failed to load incoming requests');
        }
    }

    async function loadOutgoingRequests() {
        try {
            hideError();
            messagesContainer.innerHTML = '<div class="loading-message">Loading your requests...</div>';
            
            const [requestsData, invitationsData] = await Promise.all([
                messagesAPI.getOutgoingRequests(),
                messagesAPI.getSentInvitations()
            ]);

            // Combine and normalize the data
            const requests = Array.isArray(requestsData) ? requestsData : (requestsData.results || requestsData.requests || []);
            const invitations = Array.isArray(invitationsData) ? invitationsData : (invitationsData.results || invitationsData.invitations || []);
            
            // Combine and sort by date (newest first)
            const allOutgoingItems = [...requests, ...invitations].sort((a, b) => 
                new Date(b.created_at || b.sent_at) - new Date(a.created_at || a.sent_at)
            );

            outgoingRequests = allOutgoingItems;
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

    window.respondToInvitation = async function(inviteId, accepted) {
        if (!accepted && !confirm('Are you sure you want to decline this invitation?')) {
            return;
        }
        
        try {
            hideError();
            const button = event.target;
            button.disabled = true;
            button.textContent = accepted ? 'Accepting...' : 'Declining...';
            
            await messagesAPI.respondToInvitation(inviteId, accepted);
            
            // Show success notification
            if (errorContainer) {
                errorContainer.textContent = accepted ? 'Invitation accepted!' : 'Invitation declined.';
                errorContainer.style.display = 'block';
                errorContainer.style.backgroundColor = accepted ? '#d1fae5' : '#fee2e2';
                errorContainer.style.border = accepted ? '1px solid #10b981' : '1px solid #ef4444';
                errorContainer.style.borderRadius = '0.5rem';
                errorContainer.style.padding = '0.75rem 1rem';
                errorContainer.style.color = accepted ? '#065f46' : '#991b1b';
                setTimeout(() => hideError(), 3000);
            }
            
            // Reload requests
            if (currentTab === 'incoming') {
                await loadIncomingRequests();
            }
        } catch (error) {
            console.error('Error responding to invitation:', error);
            const errorMsg = handleAPIError(error, `Failed to ${accepted ? 'accept' : 'decline'} invitation. Please try again.`);
            showErrorMsg(errorMsg);
            const button = event.target;
            button.disabled = false;
            button.textContent = accepted ? 'Accept' : 'Decline';
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
        currentTab = 'incoming';
        updateTabStyles('incoming');
        loadIncomingRequests();
    });

    outgoingTab.addEventListener('click', () => {
        if (currentTab === 'outgoing') return; // Skip if already active
        currentTab = 'outgoing';
        updateTabStyles('outgoing');
        loadOutgoingRequests();
    });


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
});

