import groupsAPI from '../src/api/groups.js';
import { authAPI } from '../src/api/auth.js';
import { showError, handleAPIError, setButtonLoading } from '../src/utils/errorHandler.js';
import { createMessageModal } from '../src/utils/modal.js';

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('id');
    const errorContainer = document.getElementById('error-container');

    const titleHeading = document.getElementById('group-title-heading');
    const nameInput = document.getElementById('group-name');
    const courseCodeInput = document.getElementById('course-code');
    const subjectAreaInput = document.getElementById('subject-area');
    const descInput = document.getElementById('group-description');
    const maxGroupSizeInput = document.getElementById('max-group-size');
    const topicsInput = document.getElementById('group-topics');
    const membersList = document.getElementById('group-members');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('save-btn');
    const findMembersBtn = document.getElementById('find-members-btn');
    const findMeetingTimesBtn = document.getElementById('find-meeting-times-btn');
    const requestJoinBtn = document.getElementById('request-join-btn');
    const leaveGroupBtn = document.getElementById('leave-group-btn');
    
    // Set up Find Members button link
    if (findMembersBtn && groupId) {
        findMembersBtn.href = `find-teammates.html?type=study-group&id=${groupId}`;
    }

    let currentGroup = null;
    let currentUserId = null;
    let currentUserUsn = null;
    let isEditing = false;
    let isMember = false;

    function showErrorMsg(message) {
        if (errorContainer) {
            // Render styled error and ensure visibility
            errorContainer.innerHTML = `<p style="margin: 0;">${message}</p>`;
            errorContainer.className = 'error-message';
            errorContainer.style.cssText = `
                display: block !important;
                max-width: 100%;
                margin: 1rem 0;
                background-color: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 0.5rem;
                padding: 0.75rem 1rem;
                color: #dc2626;
                visibility: visible;
                opacity: 1;
            `;
            setTimeout(() => {
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        } else {
            showError(message);
        }
        console.error(message);
    }

    function hideError() {
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }
    }

    function renderMembers(members) {
        console.log('Rendering members:', members);
        membersList.innerHTML = '';
        
        if (!members || members.length === 0) {
            console.warn('No members to render');
            const noMembersMsg = document.createElement('li');
            noMembersMsg.textContent = 'No members in this group';
            membersList.appendChild(noMembersMsg);
            return;
        }

        members.forEach(m => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            
            // Check for user details
            const userDetails = m.user_details || {};
            const usn = userDetails.usn || m.user;
            const fullName = userDetails.full_name || '';

            // Create display name
            const displayName = `${fullName} (${usn})` || usn || 'Member';
            
            // Set link href and text
            link.href = usn ? `/userprofile.html?usn=${encodeURIComponent(usn)}` : '#';
            link.textContent = displayName;
            link.className = 'profile-link';
            
            li.appendChild(link);
            membersList.appendChild(li);
        });

        console.log(`Rendered ${members.length} members`);
    }
    
    function updateActionButtons(isOwner, isMember) {
        // Hide all buttons first
        if (findMembersBtn) findMembersBtn.style.display = 'none';
        if (findMeetingTimesBtn) findMeetingTimesBtn.style.display = 'none';
        if (requestJoinBtn) requestJoinBtn.style.display = 'none';
        if (leaveGroupBtn) leaveGroupBtn.style.display = 'none';
        
        if (isOwner) {
            // Owner sees "Find Members" and "Find Meeting Times" buttons
            if (findMembersBtn) {
                findMembersBtn.style.display = 'inline-block';
                if (groupId) {
                    findMembersBtn.href = `find-teammates.html?type=study-group&id=${groupId}`;
                }
            }
            if (findMeetingTimesBtn) {
                findMeetingTimesBtn.style.display = 'inline-block';
                if (groupId) {
                    findMeetingTimesBtn.href = `meeting-slots.html?id=${groupId}`;
                }
            }
        } else if (isMember) {
            // Non-owner who is a member sees "Leave Group" button
            if (leaveGroupBtn) {
                leaveGroupBtn.style.display = 'inline-block';
            }
        } else {
            // Non-owner who is not a member sees "Request to Join Group" button
            if (requestJoinBtn) {
                requestJoinBtn.style.display = 'inline-block';
            }
        }
    }

    function setEditMode(on) {
        isEditing = on;
        nameInput.readOnly = !on;
        courseCodeInput.readOnly = !on;
        subjectAreaInput.readOnly = !on;
        descInput.readOnly = !on;
        maxGroupSizeInput.readOnly = !on;
        topicsInput.readOnly = !on;
        saveBtn.style.display = on ? 'inline-block' : 'none';
        editBtn.textContent = on ? 'CANCEL' : 'EDIT GROUP';
    }

    async function loadGroup() {
        try {
            hideError();
            
            // Show loading state
            const form = document.getElementById('study-group-view-form');
            if (form) {
                form.style.opacity = '0.5';
                form.style.pointerEvents = 'none';
            }
            
            const data = await groupsAPI.getGroup(groupId);
            currentGroup = data;
            
            // Hide loading state
            if (form) {
                form.style.opacity = '1';
                form.style.pointerEvents = 'auto';
            }

            // Fetch current user and compute ownership as fallback
            try {
                const user = await authAPI.getProfile();
                currentUserId = user?.id ?? user?.pk ?? user?.usn ?? null;
                currentUserUsn = user?.usn ?? null;
                console.debug('Group current user id:', currentUserId, 'USN:', currentUserUsn, 'Owner id:', data.owner_id);
            } catch (e) {
                console.warn('Failed to fetch user profile for ownership check:', e);
            }

            // Check if current user is a member
            isMember = false;
            if (data.members && Array.isArray(data.members)) {
                isMember = data.members.some(member => {
                    const memberUsn = member.user_details?.usn || member.user || member.user_id;
                    return memberUsn && (
                        String(memberUsn) === String(currentUserUsn) ||
                        String(memberUsn) === String(currentUserId) ||
                        (currentUserUsn && memberUsn.toLowerCase() === currentUserUsn.toLowerCase())
                    );
                });
            }
            currentGroup.is_member = isMember;

            // Permissions: only the owner can edit
            const isOwner = Boolean(data?.is_owner) || (currentUserId != null && data?.owner_id != null && String(currentUserId) === String(data.owner_id));
            currentGroup.is_owner = isOwner;
            
            // Show/hide edit button based on ownership
            if (isOwner) {
                editBtn.style.display = 'inline-block';
            } else {
                editBtn.style.display = 'none';
                saveBtn.style.display = 'none';
                setEditMode(false);
            }
            
            // Show/hide action buttons based on ownership and membership
            updateActionButtons(isOwner, isMember);

            titleHeading.textContent = data.name || 'STUDY GROUP';
            nameInput.value = data.name || '';
            courseCodeInput.value = data.course_code || '';
            subjectAreaInput.value = data.subject_area || '';
            descInput.value = data.description || '';
            maxGroupSizeInput.value = data.max_size ?? '';
            
            // Handle topics display
            if (data.topics_display) {
                topicsInput.value = data.topics_display.join(', ');
            } else {
                topicsInput.value = '';
            }
            
            renderMembers(data.members);
        } catch (e) {
            console.error('Study group load error:', e);
            
            // Hide the form when group is not found
            const form = document.getElementById('study-group-view-form');
            if (form) {
                form.style.display = 'none';
            }
            
            // Check if it's a "not found" error specifically
            const errorMessage = e?.message || '';
            const isNotFound = errorMessage.toLowerCase().includes('not found') || 
                             errorMessage.toLowerCase().includes('404') ||
                             errorMessage === 'Not found.';
            
            let errorMsg;
            if (isNotFound) {
                errorMsg = 'Study group not found. The study group you are looking for does not exist or may have been deleted.';
            } else {
                errorMsg = handleAPIError(e, 'Failed to load study group. Please check the group ID and try again.');
            }
            
            // Get error container and display error prominently (don't use showErrorMsg to avoid overwriting)
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) {
                // Clear any existing content first
                errorContainer.textContent = '';
                errorContainer.className = 'error-message';
                if (isNotFound) {
                    // Show prominent "not found" message with styling
                    errorContainer.innerHTML = `
                        <div style="text-align: center; padding: 2rem;">
                            <h2 style="color: #dc2626; margin-bottom: 1rem; font-size: 1.5rem; font-weight: 600;">Study Group Not Found</h2>
                            <p style="color: #6b7280; margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">
                                ${errorMsg}
                            </p>
                            <a href="dashboard.html" class="primary-btn" style="display: inline-block; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.375rem; background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%); color: white; font-weight: 600;">
                                Return to Dashboard
                            </a>
                        </div>
                    `;
                    // Apply all styles with !important to ensure they override any CSS
                    errorContainer.style.cssText = `
                        display: block !important;
                        max-width: 600px;
                        margin: 2rem auto;
                        background-color: #fef2f2;
                        border: 1px solid #fecaca;
                        border-radius: 0.5rem;
                        padding: 1.5rem;
                        min-height: 200px;
                        position: relative;
                        z-index: 10;
                        visibility: visible;
                        opacity: 1;
                    `;
                    // Scroll to error
                    setTimeout(() => {
                        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                } else {
                    // Show regular error message
                    errorContainer.innerHTML = `<p style="margin: 0;">${errorMsg}</p>`;
                    errorContainer.style.cssText = `
                        display: block !important;
                        max-width: 100%;
                        margin: 1rem 0;
                        background-color: #fef2f2;
                        border: 1px solid #fecaca;
                        border-radius: 0.5rem;
                        padding: 0.75rem 1rem;
                        color: #dc2626;
                        visibility: visible;
                        opacity: 1;
                    `;
                    setTimeout(() => {
                        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
                
                // Also log to console
                console.error('Error displayed to user:', errorMsg);
            } else {
                // Fallback if error container doesn't exist
                console.error('Error container not found! Error message:', errorMsg);
                showError(errorMsg);
            }
        }
    }

    async function saveChanges() {
        try {
            hideError();
            if (!currentGroup?.is_owner) {
                throw new Error('You do not have permission to edit this study group. Only the group owner can make changes.');
            }
            const maxSize = parseInt(maxGroupSizeInput.value);
            if (isNaN(maxSize) || maxSize < 1 || maxSize > 10) {
                throw new Error('Max group size must be between 1 and 10');
            }

            const payload = {
                name: nameInput.value.trim(),
                course_code: courseCodeInput.value.trim(),
                subject_area: subjectAreaInput.value.trim(),
                description: descInput.value.trim(),
                max_size: maxSize,
                topics: (topicsInput.value || '').split(',').map(t => t.trim()).filter(Boolean)
            };

            await groupsAPI.updateGroup(groupId, payload);
            await loadGroup();
            setEditMode(false);
        } catch (e) {
            const errorMsg = handleAPIError(e, 'Failed to save changes.');
            showErrorMsg(errorMsg);
        }
    }

    editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentGroup?.is_owner) {
            showErrorMsg('You do not have permission to edit this study group. Only the group owner can make changes.');
            return;
        }
        setEditMode(!isEditing);
        if (!isEditing) loadGroup();
    });
    saveBtn.addEventListener('click', saveChanges);
    
    // Handle join group request
    if (requestJoinBtn) {
        requestJoinBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Show modal for message input
            createMessageModal(async (message) => {
                try {
                    hideError();
                    requestJoinBtn.disabled = true;
                    requestJoinBtn.textContent = 'Requesting...';
                    
                    await groupsAPI.joinGroup(groupId, message);
                    
                    // Show success and reload
                    showError('Join request sent successfully!', { type: 'info', duration: 3000 });
                    setTimeout(() => {
                        loadGroup(); // Reload to update membership status
                    }, 1000);
                } catch (error) {
                    console.error('Error joining group:', error);
                    const errorMsg = handleAPIError(error, 'Failed to request joining the group. Please try again.');
                    showErrorMsg(errorMsg);
                    requestJoinBtn.disabled = false;
                    requestJoinBtn.textContent = 'Request to Join Group';
                }
            });
        });
    }
    
    // Handle leave group
    if (leaveGroupBtn) {
        leaveGroupBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Confirm before leaving
            if (!confirm('Are you sure you want to leave this study group?')) {
                return;
            }
            
            try {
                hideError();
                leaveGroupBtn.disabled = true;
                leaveGroupBtn.textContent = 'Leaving...';
                
                await groupsAPI.leaveGroup(groupId);
                
                // Show success and reload
                showError('You have left the study group.', { type: 'info', duration: 3000 });
                setTimeout(() => {
                    loadGroup(); // Reload to update membership status
                }, 1000);
            } catch (error) {
                console.error('Error leaving group:', error);
                const errorMsg = handleAPIError(error, 'Failed to leave the group. Please try again.');
                showErrorMsg(errorMsg);
                leaveGroupBtn.disabled = false;
                leaveGroupBtn.textContent = 'Leave Group';
            }
        });
    }

    if (!groupId) {
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.innerHTML = `<p style="margin: 0; color: #dc2626;">Missing group ID. Please provide a valid study group ID in the URL.</p>`;
            errorContainer.style.cssText = `
                display: block !important;
                max-width: 100%;
                margin: 1rem 0;
                background-color: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 0.5rem;
                padding: 0.75rem 1rem;
                color: #dc2626;
                visibility: visible;
                opacity: 1;
            `;
        } else {
            showError('Missing group ID. Please provide a valid study group ID in the URL.');
        }
        const form = document.getElementById('study-group-view-form');
        if (form) {
            form.style.display = 'none';
        }
        return;
    }
    
    setEditMode(false);
    loadGroup();
});