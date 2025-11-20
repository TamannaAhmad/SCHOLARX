import projectsAPI from '../src/api/projects.js';
import { authAPI } from '../src/api/auth.js';
import { showError, showSuccess, handleAPIError, setButtonLoading } from '../src/utils/errorHandler.js';
import { createMessageModal } from '../src/utils/modal.js';

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    const errorContainer = document.getElementById('error-container');

    const titleHeading = document.getElementById('project-title-heading');
    const titleInput = document.getElementById('project-title');
    const typeSelect = document.getElementById('project-type');
    const statusInput = document.getElementById('project-status');
    const descInput = document.getElementById('project-description');
    const skillsContainer = document.getElementById('selected-skills');
    const skillsSearchWrapper = document.getElementById('skills-search-wrapper');
    const skillsInput = document.getElementById('skills-input');
    const skillsSuggestions = document.getElementById('skills-suggestions');
    const maxTeamSizeInput = document.getElementById('max-team-size');
    const deadlineInput = document.getElementById('project-deadline');
    const membersList = document.getElementById('team-members');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('save-btn');
    const findTeammatesBtn = document.getElementById('find-teammates-btn');
    const findMeetingTimesBtn = document.getElementById('find-meeting-times-btn');
    const requestJoinBtn = document.getElementById('request-join-btn');
    const leaveProjectBtn = document.getElementById('leave-project-btn');
    
    // Set up Find Teammates button click handler
    if (findTeammatesBtn && projectId) {
        findTeammatesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = `/find-teammates.html?type=project&id=${projectId}`;
        });
    }

    let currentProject = null;
    let currentUserId = null;
    let currentUserUsn = null;
    let allSkills = [];
    let selectedSkills = []; // array of {id, name}
    let isEditing = false;
    let isMember = false;
    let statusDisplayToValue = {};
    let statusValueToDisplay = {};

    async function loadUpdateOptions() {
        try {
            const opts = await projectsAPI.getProjectUpdateOptions(projectId);
            // Try DRF OPTIONS common shapes
            const field = opts?.actions?.PUT?.status || opts?.actions?.PUT?.fields?.status || opts?.status;
            const choices = field?.choices || field?.enum || [];
            statusDisplayToValue = {};
            statusValueToDisplay = {};
            choices.forEach(ch => {
                const value = ch.value ?? ch.key ?? ch.code ?? ch.id ?? ch;
                const display = ch.display_name ?? ch.display ?? ch.label ?? String(ch).charAt(0).toUpperCase() + String(ch).slice(1);
                statusDisplayToValue[String(display)] = String(value);
                statusValueToDisplay[String(value)] = String(display);
            });
        } catch (e) {
            console.warn('Failed to load OPTIONS for update:', e);
        }
    }

    function resolveStatusValue(displayLabel) {
        if (statusDisplayToValue && statusDisplayToValue[displayLabel]) {
            return statusDisplayToValue[displayLabel];
        }
        // Fallbacks: try common casings
        const low = displayLabel.toLowerCase();
        if (statusDisplayToValue['Planning'] && low === 'planning') return statusDisplayToValue['Planning'];
        if (statusDisplayToValue['Active'] && low === 'active') return statusDisplayToValue['Active'];
        if (statusDisplayToValue['Completed'] && low === 'completed') return statusDisplayToValue['Completed'];
        // Last resort: pass-through
        return displayLabel;
    }

    // Map UI label to backend expected casing, inferred from current backend value
    function mapStatusForApi(label, currentRaw) {
        const lbl = String(label || '');
        const cur = String(currentRaw || '');
        if (!cur) return lbl; // fallback
        const isUpper = /^[A-Z_]+$/.test(cur);
        const isLower = cur === cur.toLowerCase();
        const isTitle = cur[0] === cur[0]?.toUpperCase() && cur.slice(1) === cur.slice(1).toLowerCase();
        if (isUpper) return lbl.toUpperCase();
        if (isLower) return lbl.toLowerCase();
        if (isTitle) return lbl.charAt(0).toUpperCase() + lbl.slice(1).toLowerCase();
        return lbl; // unknown style, pass-through
    }

    function showErrorMsg(message) {
        showError(message, {duration: 5000});
    }

    function showSuccessMsg(message) {
        showSuccess(message, {duration: 3000});
    }

    function hideError() {
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }
    }

    function renderSkills(skills) {
        console.log('Rendering skills. isEditing:', isEditing, 'Skills:', skills);
        skillsContainer.innerHTML = '';
        
        if (!skills || !Array.isArray(skills)) {
            console.warn('No skills array provided or skills is not an array');
            return;
        }
        
        skills.forEach((s, index) => {
            const name = s.skill?.name || s.name || '';
            const id = s.skill?.id || s.id;
            const tag = document.createElement('div');
            tag.className = 'skill-tag';
            
            // Create the remove button HTML conditionally
            const removeButtonHtml = isEditing 
                ? `<button type="button" class="remove-skill" data-index="${index}" data-id="${id}" style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-left: 4px;">&times;</button>`
                : '';
                
            tag.innerHTML = `
                <span>${name}</span>
                ${removeButtonHtml}
            `;
            
            skillsContainer.appendChild(tag);
        });

        if (isEditing) {
            const removeButtons = skillsContainer.querySelectorAll('.remove-skill');
            
            removeButtons.forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const idx = parseInt(this.getAttribute('data-index'));
                    selectedSkills.splice(idx, 1);
                    renderSkills(selectedSkills);
                });
            });
        }
    }

    function showSkillSuggestions(searchTerm) {
        skillsSuggestions.innerHTML = '';
        const filtered = allSkills.filter(sk =>
            sk.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !selectedSkills.some(sel => sel.id === sk.id)
        );
        filtered.forEach(sk => {
            const item = document.createElement('div');
            item.className = 'skill-suggestion';
            item.textContent = sk.name;
            item.addEventListener('click', () => {
                selectedSkills.push(sk);
                skillsInput.value = '';
                skillsSuggestions.innerHTML = '';
                renderSkills(selectedSkills);
            });
            skillsSuggestions.appendChild(item);
        });
        skillsSuggestions.style.display = filtered.length > 0 ? 'block' : 'none';
    }

    function renderMembers(members) {
        membersList.innerHTML = '';
        (members || []).forEach(m => {
            const li = document.createElement('li');
            const memberContainer = document.createElement('div');
            memberContainer.className = 'member-container';
            
            const link = document.createElement('a');
            link.href = m.profile_url || (m.usn ? `/userprofile.html?usn=${encodeURIComponent(m.usn)}` : '#');
            const displayName = m.name && m.name.trim().length > 0 ? m.name : (m.usn || 'Member');
            const usnSuffix = m.usn ? ` (${m.usn})` : '';
            link.textContent = `${displayName}${usnSuffix}`;
            link.className = 'profile-link';
            
            memberContainer.appendChild(link);
            
            // Add remove button for owner (except for themselves)
            if (currentProject?.is_owner && m.usn !== currentUserUsn && isEditing) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-member-btn';
                removeBtn.title = 'Remove member';
                removeBtn.innerHTML = '&times;';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeMember(m.usn, m.name || 'member');
                });
                memberContainer.appendChild(removeBtn);
            }
            
            li.appendChild(memberContainer);
            membersList.appendChild(li);
        });
    }

    function updateActionButtons(isOwner, isMember) {
        // Hide all buttons first
        if (findTeammatesBtn) findTeammatesBtn.style.display = 'none';
        if (findMeetingTimesBtn) findMeetingTimesBtn.style.display = 'none';
        if (requestJoinBtn) {
            requestJoinBtn.style.display = 'none';
            requestJoinBtn.disabled = false;
            requestJoinBtn.style.opacity = '1';
            requestJoinBtn.style.cursor = 'pointer';
            requestJoinBtn.title = '';
        }
        if (leaveProjectBtn) leaveProjectBtn.style.display = 'none';
        
        if (isOwner) {
            // Owner sees "Find Teammates" and "Find Meeting Times" buttons
            if (findTeammatesBtn) {
                findTeammatesBtn.style.display = 'inline-block';
            }
            if (findMeetingTimesBtn) {
                findMeetingTimesBtn.style.display = 'inline-block';
                if (projectId && !findMeetingTimesBtn.onclick) {
                    findMeetingTimesBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.location.href = `/meeting-slots.html?type=project&id=${projectId}`;
                    });
                }
            }
        } else if (isMember) {
            // Non-owner who is a member sees "Leave Project" button
            if (leaveProjectBtn) {
                leaveProjectBtn.style.display = 'inline-block';
            }
        } else {
            // Non-owner who is not a member sees "Request to Join Project" button
            if (requestJoinBtn) {
                // Check if project team is full
                const currentMembers = currentProject?.members?.length || 0;
                const maxMembers = currentProject?.max_team_size || 0;
                const isFull = maxMembers > 0 && currentMembers >= maxMembers;
                
                requestJoinBtn.style.display = 'inline-block';
                
                if (isFull) {
                    requestJoinBtn.disabled = true;
                    requestJoinBtn.style.opacity = '0.6';
                    requestJoinBtn.style.cursor = 'not-allowed';
                    requestJoinBtn.title = 'This project team has reached its maximum capacity';
                } else {
                    requestJoinBtn.disabled = false;
                    requestJoinBtn.style.opacity = '1';
                    requestJoinBtn.style.cursor = 'pointer';
                    requestJoinBtn.title = '';
                }
            }
        }
    }

    function setEditMode(on) {
        isEditing = on;
        
        titleInput.readOnly = !on;
        typeSelect.disabled = !on;
        descInput.readOnly = !on;
        maxTeamSizeInput.readOnly = !on;
        deadlineInput.readOnly = !on;
        
        if (skillsInput) {
            skillsInput.disabled = !on;
        }
        
        if (skillsSearchWrapper) {
            skillsSearchWrapper.style.display = on ? 'block' : 'none';
        }
        
        if (!on) {
            skillsSuggestions.innerHTML = '';
            skillsSuggestions.style.display = 'none';
        }
        
        saveBtn.style.display = on ? 'inline-block' : 'none';
        editBtn.textContent = on ? 'CANCEL' : 'EDIT PROJECT';
        
        // Ensure status dropdown works exactly like project type dropdown
        statusInput.disabled = !on;
        
        // Re-render skills to update the remove buttons
        renderSkills(selectedSkills);

        if (currentProject?.members) {
            renderMembers(currentProject.members);
        }
    }

    // Hide edit controls by default until ownership is confirmed
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    async function loadProject() {
        try {
            hideError();
            
            // Show loading state
            const form = document.getElementById('project-view-form');
            if (form) {
                form.style.opacity = '0.5';
                form.style.pointerEvents = 'none';
            }
            
            const data = await projectsAPI.getProjectDetails(projectId);
            currentProject = data;
            
            // Set the project title in the heading and input field
            if (titleHeading) titleHeading.textContent = data.title || 'Project';
            if (titleInput) titleInput.value = data.title || '';
            
            // Update the page title
            document.title = data.title ? `${data.title} | ScholarX` : 'Project | ScholarX';
            
            // Hide loading state
            if (form) {
                form.style.opacity = '1';
                form.style.pointerEvents = 'auto';
            }

            // Fetch current user id to double-check ownership if backend flag is incorrect/stale
            try {
                const user = await authAPI.getProfile();
                currentUserId = user?.id ?? user?.pk ?? user?.usn ?? null;
                currentUserUsn = user?.usn ?? null;
            } catch (e) {
                console.warn('Failed to fetch user profile for ownership check:', e);
            }

            // Check if current user is a member
            isMember = false;
            if (data.members && Array.isArray(data.members)) {
                isMember = data.members.some(member => {
                    const memberUsn = member.usn || member.user || member.user_id;
                    return memberUsn && (
                        String(memberUsn) === String(currentUserUsn) ||
                        String(memberUsn) === String(currentUserId) ||
                        (currentUserUsn && memberUsn.toLowerCase() === currentUserUsn.toLowerCase())
                    );
                });
            }
            currentProject.is_member = isMember;

            // Permissions: only the owner can edit
            const isOwner = Boolean(data?.is_owner) || (currentUserId != null && data?.owner_id != null && String(currentUserId) === String(data.owner_id));
            currentProject.is_owner = isOwner; // ensure consistency for later checks
            
            // Update edit button visibility
            if (editBtn) {
                editBtn.style.display = isOwner ? 'inline-block' : 'none';
            }
            
            updateActionButtons(isOwner, isMember);
            
            // Set form field values
            const typeOptions = Array.from(typeSelect?.options || []).map(o => o.value);
            typeSelect.value = typeOptions.includes(data.project_type) ? data.project_type : '';
            // Ensure status is set to a valid option using values from the DOM
            const statusOptions = Array.from(statusInput?.options || []).map(o => o.value);
            const normalizedStatus = String((data.status_display || data.status || '')).toLowerCase();
            const normalizedKey = normalizedStatus && statusOptions.includes(normalizedStatus) ? normalizedStatus :
                  (statusOptions.includes('planning') ? 'planning' : (statusOptions[0] || ''));
            statusInput.value = normalizedKey;
            descInput.value = data.description || '';
            maxTeamSizeInput.value = data.max_team_size ?? '';
            if (data.deadline) deadlineInput.value = data.deadline;
            // convert to local selectedSkills structure
            selectedSkills = (data.skills || []).map(s => ({ id: s.skill?.id, name: s.skill?.name }))
                .filter(s => s.id && s.name);
            renderSkills(selectedSkills);
            renderMembers(data.members);
        } catch (e) {
            console.error('Project load error:', e);
            
            // Hide the form when project is not found
            const form = document.getElementById('project-view-form');
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
                errorMsg = 'Project not found. The project you are looking for does not exist or may have been deleted.';
            } else {
                errorMsg = handleAPIError(e, 'Failed to load project. Please check the project ID and try again.');
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
                            <h2 style="color: #dc2626; margin-bottom: 1rem; font-size: 1.5rem; font-weight: 600;">Project Not Found</h2>
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

    async function removeMember(usn, memberName) {
        if (!usn || !confirm(`Are you sure you want to remove ${memberName} from this project?`)) {
            return;
        }

        try {
            if (saveBtn) setButtonLoading(saveBtn, true, 'Removing...');
            await projectsAPI.removeMember(projectId, usn);
            
            // Update the UI by removing the member from the list
            currentProject.members = currentProject.members.filter(m => m.usn !== usn);
            renderMembers(currentProject.members);
            showSuccessMsg(`${memberName} has been removed from the project.`);
        } catch (error) {
            console.error('Error removing member:', error);
            handleAPIError(error, 'Failed to remove member');
        } finally {
            if (saveBtn) setButtonLoading(saveBtn, false);
        }
    }

    async function saveChanges() {
        try {
            hideError();
            // Prevent saving if not owner
            if (!currentProject?.is_owner) {
                throw new Error('You do not have permission to edit this project. Only the project owner can make changes.');
            }
            // Validate max team size
            const maxTeamSize = parseInt(maxTeamSizeInput.value);
            if (isNaN(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 10) {
                throw new Error('Max team size must be between 1 and 10.');
            }
            
            // Check if new max size is less than current number of members
            const currentMemberCount = currentProject?.members?.length || 0;
            if (maxTeamSize < currentMemberCount) {
                throw new Error(`Cannot set max team size to ${maxTeamSize} because there are already ${currentMemberCount} members in the team.`);
            }

            // Ensure status is one of the select's current option values
            const validStatuses = Array.from(statusInput?.options || []).map(o => o.value);
            const status = statusInput.value.trim();
            if (!validStatuses.includes(status)) {
                const human = Array.from(statusInput?.options || []).map(o => o.textContent).join(', ');
                throw new Error(`Invalid project status. Must be one of: ${human || 'Planning, Active, Completed'}`);
            }
            
            const payload = {
                title: titleInput.value.trim(),
                type: typeSelect.value,
                description: descInput.value.trim(),
                max_team_size: maxTeamSize,
                status: status,
                deadline: deadlineInput.value || null,
                required_skills: selectedSkills.map(s => s.id)
            };
            
            if (saveBtn) setButtonLoading(saveBtn, true, 'Saving...');
            
            try {
                const response = await projectsAPI.updateProject(projectId, payload);
                await loadProject();
                setEditMode(false);
                // Show success notification
                showSuccessMsg('Project updated successfully!', { duration: 3000 });
            } catch (error) {
                // Log the full error for debugging
                console.error('API Error Details:', {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    payload: JSON.stringify(payload)
                });
                
                // Show error notification with the error message
                const errorMsg = handleAPIError(error, 'Failed to update project. Please try again.');
                showErrorMsg(errorMsg);
            } finally {
                if (saveBtn) setButtonLoading(saveBtn, false);
            }
        } catch (error) {
            // Handle validation errors
            showError(error.message, { duration: 5000 });
        }
    }

    editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentProject?.is_owner) {
            showErrorMsg('You do not have permission to edit this project.');
            return;
        }
        setEditMode(!isEditing);
        if (!isEditing) loadProject();
    });
    saveBtn.addEventListener('click', saveChanges);
    
    // Handle join project request
    if (requestJoinBtn) {
        requestJoinBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Store original button state
            const originalBtnText = requestJoinBtn.textContent;
            const originalBtnDisabled = requestJoinBtn.disabled;
            
            // Show modal for message input
            createMessageModal(async (message) => {
                try {
                    hideError();
                    setButtonLoading(requestJoinBtn, true, 'Requesting...');
                    
                    await projectsAPI.joinProject(projectId, message);
                    
                    // Show success and reload
                    showError('Join request sent successfully!', { type: 'info', duration: 3000 });
                    setTimeout(() => {
                        loadProject(); // Reload to update membership status
                    }, 1000);
                } catch (error) {
                    console.error('Error joining project:', error);
                    const errorMsg = handleAPIError(error, 'Failed to request joining the project. Please try again.');
                    showErrorMsg(errorMsg);
                    // Reset button to original state
                    requestJoinBtn.textContent = originalBtnText;
                    requestJoinBtn.disabled = originalBtnDisabled;
                }
            }, () => {
                // On modal close (cancel), reset button state
                requestJoinBtn.textContent = originalBtnText;
                requestJoinBtn.disabled = originalBtnDisabled;
            });
        });
    }
    
    // Function to show leave project modal
    function showLeaveProjectModal() {
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
            background: white;
            padding: 2rem;
            border-radius: 0.5rem;
            width: 100%;
            max-width: 500px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Leave Project';
        title.style.marginTop = '0';
        title.style.marginBottom = '1.5rem';
        title.style.color = '#1f2937';
        title.style.fontSize = '1.25rem';

        const messageLabel = document.createElement('label');
        messageLabel.textContent = 'Leave a message (optional)';
        messageLabel.style.display = 'block';
        messageLabel.style.marginBottom = '0.5rem';
        messageLabel.style.fontWeight = '500';
        messageLabel.style.color = '#374151';

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Let the project owner know why you\'re leaving...';
        textarea.style.cssText = `
            width: 100%;
            min-height: 100px;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            font-family: inherit;
            font-size: 0.95rem;
            resize: vertical;
            margin-bottom: 1.5rem;
            transition: border-color 0.2s, box-shadow 0.2s;
        `;
        
        // Add focus styles
        textarea.addEventListener('focus', () => {
            textarea.style.borderColor = '#3b82f6';
            textarea.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.2)';
            textarea.style.outline = 'none';
        });
        
        textarea.addEventListener('blur', () => {
            textarea.style.borderColor = '#d1d5db';
            textarea.style.boxShadow = 'none';
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '0.75rem';
        buttonContainer.style.justifyContent = 'flex-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 0.5rem 1rem;
            background-color: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
            cursor: pointer;
            font-weight: 500;
        `;
        cancelBtn.onclick = () => document.body.removeChild(modal);

        const leaveBtn = document.createElement('button');
        leaveBtn.textContent = 'Leave Project';
        leaveBtn.style.cssText = `
            padding: 0.5rem 1rem;
            background-color: #ef4444;
            color: white;
            border: none;
            border-radius: 0.375rem;
            cursor: pointer;
            font-weight: 500;
        `;

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(leaveBtn);

        modalContent.appendChild(title);
        modalContent.appendChild(messageLabel);
        modalContent.appendChild(textarea);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Focus the textarea when modal opens
        setTimeout(() => textarea.focus(), 100);

        // Handle leave project submission
        leaveBtn.onclick = async () => {
            try {
                const message = textarea.value.trim();
                leaveBtn.disabled = true;
                leaveBtn.textContent = 'Leaving...';
                
                await projectsAPI.leaveProject(projectId, message);
                
                // Show success and reload
                showError('You have left the project.', { type: 'info', duration: 3000 });
                document.body.removeChild(modal);
                
                setTimeout(() => {
                    loadProject(); // Reload to update membership status
                }, 1000);
            } catch (error) {
                console.error('Error leaving project:', error);
                const errorMsg = handleAPIError(error, 'Failed to leave the project. Please try again.');
                showErrorMsg(errorMsg);
                leaveBtn.disabled = false;
                leaveBtn.textContent = 'Leave Project';
            }
        };
    }

    // Handle leave project
    if (leaveProjectBtn) {
        leaveProjectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showLeaveProjectModal();
        });
    }

    // skill input handlers
    if (skillsInput) {
        skillsInput.addEventListener('input', function() {
            const term = this.value.trim();
            if (term) showSkillSuggestions(term);
            else {
                skillsSuggestions.innerHTML = '';
                skillsSuggestions.style.display = 'none';
            }
        });
        document.addEventListener('click', function(e) {
            if (!skillsSuggestions.contains(e.target) && e.target !== skillsInput) {
                skillsSuggestions.innerHTML = '';
                skillsSuggestions.style.display = 'none';
            }
        });
    }

    if (!projectId) {
        showErrorMsg('Missing project ID. Please provide a valid project ID in the URL.');
        return;
    }
    setEditMode(false);
    // preload all skills for suggestions and fetch update OPTIONS
    (async () => {
        try {
            // Fetch skills with optional department filtering
            allSkills = await projectsAPI.fetchSkills();
            await loadUpdateOptions();
        } catch (e) {
            console.error('Skills fetching error:', e);
            const errorMsg = handleAPIError(e, 'Failed to load skills. Please try again.');
            showErrorMsg(errorMsg);
        }
        loadProject();
    })();
});


