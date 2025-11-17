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
    const skillsContainer = document.getElementById('selected-skills');
    const skillsSearchWrapper = document.getElementById('skills-search-wrapper');
    const skillsInput = document.getElementById('skills-input');
    const skillsSuggestions = document.getElementById('skills-suggestions');
    const membersList = document.getElementById('group-members');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('save-btn');
    const findMembersBtn = document.getElementById('find-members-btn');
    const findMeetingTimesBtn = document.getElementById('find-meeting-times-btn');
    const requestJoinBtn = document.getElementById('request-join-btn');
    const leaveGroupBtn = document.getElementById('leave-group-btn');
    
    let allSkills = [];
    let selectedSkills = []; // array of {id, name}
    
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

    function showSuccessMsg(message) {
        if (errorContainer) {
            errorContainer.innerHTML = `<p style="margin: 0;">${message}</p>`;
            errorContainer.className = 'success-message';
            errorContainer.style.cssText = `
                display: block !important;
                max-width: 100%;
                margin: 1rem 0;
                background-color: #f0fdf4;
                border: 1px solid #bbf7d0;
                border-radius: 0.5rem;
                padding: 0.75rem 1rem;
                color: #15803d;
                visibility: visible;
                opacity: 1;
            `;
            setTimeout(() => {
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        } else {
            console.log('Success:', message);
        }
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
        if (requestJoinBtn) {
            requestJoinBtn.style.display = 'none';
            requestJoinBtn.disabled = false;
            requestJoinBtn.style.opacity = '1';
            requestJoinBtn.style.cursor = 'pointer';
        }
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
                // Check if group is full
                const currentMembers = currentGroup?.members?.length || 0;
                const maxMembers = currentGroup?.max_size || 0;
                const isFull = maxMembers > 0 && currentMembers >= maxMembers;
                
                requestJoinBtn.style.display = 'inline-block';
                
                if (isFull) {
                    requestJoinBtn.disabled = true;
                    requestJoinBtn.style.opacity = '0.6';
                    requestJoinBtn.style.cursor = 'not-allowed';
                    requestJoinBtn.title = 'This group has reached its maximum capacity';
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
        nameInput.readOnly = !on;
        courseCodeInput.readOnly = !on;
        subjectAreaInput.readOnly = !on;
        descInput.readOnly = !on;
        maxGroupSizeInput.readOnly = !on;
        
        // Toggle skills input
        if (skillsSearchWrapper) {
            skillsSearchWrapper.style.display = on ? 'block' : 'none';
            if (on) {
                if (skillsInput) {
                    skillsInput.disabled = false;
                    skillsInput.focus();
                }
                // Initialize skills if not already done
                if (allSkills.length === 0) {
                    loadSkills();
                }
            } else {
                if (skillsInput) {
                    skillsInput.disabled = true;
                    skillsInput.value = '';
                }
                if (skillsSuggestions) {
                    skillsSuggestions.innerHTML = '';
                    skillsSuggestions.style.display = 'none';
                }
            }
        }
        
        // Re-render skills to update remove buttons
        renderSkills(selectedSkills);
        
        // Toggle edit/save buttons
        if (editBtn) editBtn.style.display = on ? 'none' : 'inline-block';
        if (saveBtn) saveBtn.style.display = on ? 'inline-block' : 'none';
    }

    async function loadSkills() {
        try {
            const skills = await groupsAPI.getSkills();
            allSkills = skills;
            renderSkills(selectedSkills);
        } catch (error) {
            console.error('Error loading skills:', error);
            showErrorMsg('Failed to load skills. Please refresh the page to try again.');
        }
    }
    
    function showSkillSuggestions(searchTerm) {
        if (!skillsSuggestions) return;
        
        skillsSuggestions.innerHTML = '';
        
        if (!searchTerm || searchTerm.trim() === '') {
            skillsSuggestions.style.display = 'none';
            return;
        }
        
        const filtered = allSkills.filter(skill => 
            skill.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !selectedSkills.some(s => s.id === skill.id)
        );
        
        if (filtered.length === 0) {
            skillsSuggestions.style.display = 'none';
            return;
        }
        
        filtered.forEach(skill => {
            const suggestion = document.createElement('div');
            suggestion.className = 'skill-suggestion';
            suggestion.textContent = skill.name;
            suggestion.onclick = () => addSkill(skill);
            skillsSuggestions.appendChild(suggestion);
        });
        
        skillsSuggestions.style.display = 'block';
    }
    
    function addSkill(skill) {
        if (!selectedSkills.some(s => s.id === skill.id)) {
            selectedSkills.push(skill);
            renderSkills(selectedSkills);
        }
        
        if (skillsInput) {
            skillsInput.value = '';
            skillsInput.focus();
        }
        
        if (skillsSuggestions) {
            skillsSuggestions.style.display = 'none';
        }
    }
    
    function removeSkill(skillId) {
        selectedSkills = selectedSkills.filter(skill => skill.id !== skillId);
        renderSkills(selectedSkills);
    }
    
    function renderSkills(skills) {
        if (!skillsContainer) return;
        skillsContainer.innerHTML = '';
        (skills || []).forEach((s, index) => {
            const name = s.skill?.name || s.name || '';
            const id = s.skill?.id || s.id;
            const tag = document.createElement('div');
            tag.className = 'skill-tag';
            tag.innerHTML = `
            <span>${name}</span>
            ${isEditing ? `<button type="button" class="remove-skill" data-index="${index}" data-id="${id}">&times;</button>` : ''}
        `;
            skillsContainer.appendChild(tag);
        });

        if (isEditing) {
            skillsContainer.querySelectorAll('.remove-skill').forEach(btn => {
                btn.addEventListener('click', function() {
                    const idx = parseInt(this.getAttribute('data-index'));
                    selectedSkills.splice(idx, 1);
                    renderSkills(selectedSkills);
                });
            });
        }
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
            
            const group = await groupsAPI.getGroup(groupId);
            currentGroup = group;
            
            // Set form values
            titleHeading.textContent = group.name;
            nameInput.value = group.name || '';
            courseCodeInput.value = group.course_code || '';
            subjectAreaInput.value = group.subject_area || '';
            descInput.value = group.description || '';
            maxGroupSizeInput.value = group.max_group_size || 5;
            
            // Handle skills
            selectedSkills = (group.skills || []).map(s => ({ 
                id: s.skill?.id || s.id, 
                name: s.skill?.name || s.name 
            })).filter(s => s.id && s.name);
            
            renderSkills(selectedSkills);
            
            // Load members
            if (group.members) {
                renderMembers(group.members);
            }
            
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
                console.debug('Group current user id:', currentUserId, 'USN:', currentUserUsn, 'Owner id:', group.owner_id);
            } catch (e) {
                console.warn('Failed to fetch user profile for ownership check:', e);
            }

            // Check if current user is a member
            isMember = false;
            if (group.members && Array.isArray(group.members)) {
                isMember = group.members.some(member => {
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
            const isOwner = Boolean(group?.is_owner) || (currentUserId != null && group?.owner_id != null && String(currentUserId) === String(group.owner_id));
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

            function renderGroup() {
                if (!currentGroup) return;

                titleHeading.textContent = currentGroup.name;
                nameInput.value = currentGroup.name || '';
                courseCodeInput.value = currentGroup.course_code || '';
                subjectAreaInput.value = currentGroup.subject_area || '';
                descInput.value = currentGroup.description || '';
                maxGroupSizeInput.value = currentGroup.max_size || '';
                
                // Handle skills display
                const skillsContainer = document.getElementById('skills-display');
                if (skillsContainer) {
                    if (currentGroup.skills_display && currentGroup.skills_display.length > 0) {
                        skillsContainer.innerHTML = currentGroup.skills_display
                            .map(skill => `<span class="skill-tag">${skill.name}</span>`)
                            .join('');
                    } else {
                        skillsContainer.innerHTML = '<span class="text-muted">No skills specified</span>';
                    }
                }
            }
            renderGroup();
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
            setButtonLoading(saveBtn, true);

            const updatedData = {
                name: nameInput.value.trim(),
                description: descInput.value.trim(),
                course_code: courseCodeInput.value.trim(),
                subject_area: subjectAreaInput.value.trim(),
                max_size: parseInt(maxGroupSizeInput.value) || 5,
                required_skills: selectedSkills.map(skill => skill.id)
            };

            // Validate required fields
            if (!updatedData.name) {
                throw new Error('Group name is required');
            }
            
            const updatedGroup = await groupsAPI.updateGroup(groupId, updatedData);
            
            // Preserve the ownership and membership information when updating currentGroup
            currentGroup = {
                ...updatedGroup,
                is_owner: currentGroup?.is_owner || false,  // Preserve ownership status
                is_member: currentGroup?.is_member || false, // Preserve membership status
                owner_id: currentGroup?.owner_id || null     // Preserve owner ID
            };
            
            // Update the UI with the saved data
            titleHeading.textContent = updatedGroup.name;
            
            // Show success message
            showSuccessMsg('Group updated successfully!');
            setTimeout(hideError, 3000);
            
            // Switch back to view mode
            setEditMode(false);
        } catch (error) {
            console.error('Error updating group:', error);
            showErrorMsg(handleAPIError(error, 'Failed to update group. Please try again.'));
        } finally {
            setButtonLoading(saveBtn, false);
        }
    }

    if (skillsInput) {
        skillsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = skillsInput.value.trim();
                if (value) {
                    const existingSkill = allSkills.find(s => s.name.toLowerCase() === value.toLowerCase());
                    if (existingSkill) {
                        addSkill(existingSkill);
                    } else {
                        // Optionally create a new skill if your API supports it
                        const newSkill = { id: `temp-${Date.now()}`, name: value };
                        allSkills.push(newSkill);
                        addSkill(newSkill);
                    }
                    skillsInput.value = '';
                    skillsSuggestions.style.display = 'none';
                }
            }
        });

        // Show suggestions when typing
        skillsInput.addEventListener('input', (e) => {
            showSkillSuggestions(e.target.value);
        });
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
    
    // Function to show leave group modal
    function showLeaveGroupModal() {
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
        title.textContent = 'Leave Study Group';
        title.style.marginTop = '0';
        title.style.marginBottom = '1rem';
        title.style.color = '#1f2937';

        const messageLabel = document.createElement('label');
        messageLabel.textContent = 'Leave a message (optional)';
        messageLabel.style.display = 'block';
        messageLabel.style.marginBottom = '0.5rem';
        messageLabel.style.fontWeight = '500';
        messageLabel.style.color = '#374151';

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width: 100%;
            min-height: 100px;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
            font-family: inherit;
            resize: vertical;
        `;
        textarea.placeholder = 'Let the group owner know why you\'re leaving...';

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
        leaveBtn.textContent = 'Leave Group';
        leaveBtn.style.cssText = `
            padding: 0.5rem 1rem;
            background-color: #ef4444;
            color: white;
            border: none;
            border-radius: 0.375rem;
            cursor: pointer;
            font-weight: 500;
        `;
        leaveBtn.onclick = async () => {
            try {
                const message = textarea.value.trim();
                leaveBtn.disabled = true;
                leaveBtn.textContent = 'Leaving...';
                
                await groupsAPI.leaveGroup(groupId, message);
                
                // Show success and reload
                showError('You have left the study group.', { type: 'info', duration: 3000 });
                document.body.removeChild(modal);
                
                setTimeout(() => {
                    loadGroup(); // Reload to update membership status
                }, 1000);
            } catch (error) {
                console.error('Error leaving group:', error);
                const errorMsg = handleAPIError(error, 'Failed to leave the group. Please try again.');
                showErrorMsg(errorMsg);
                leaveBtn.disabled = false;
                leaveBtn.textContent = 'Leave Group';
            }
        };

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
    }

    // Handle leave group
    if (leaveGroupBtn) {
        leaveGroupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showLeaveGroupModal();
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

    // Event listeners for skills input
    if (skillsInput) {
        skillsInput.addEventListener('input', (e) => {
            showSkillSuggestions(e.target.value);
        });

        skillsInput.addEventListener('focus', () => {
            if (skillsInput.value) {
                showSkillSuggestions(skillsInput.value);
            }
        });

        skillsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = skillsInput.value.trim();
                if (value) {
                    const existingSkill = allSkills.find(s => 
                        s.name.toLowerCase() === value.toLowerCase()
                    );
                    if (existingSkill) {
                        addSkill(existingSkill);
                    }
                }
            } else if (e.key === 'Escape') {
                skillsInput.blur();
                if (skillsSuggestions) {
                    skillsSuggestions.style.display = 'none';
                }
            }
        });
    }

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
        if (skillsSuggestions && !skillsSearchWrapper.contains(e.target)) {
            skillsSuggestions.style.display = 'none';
        }
    });

    // Edit button click handler
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentGroup?.is_owner) {
                showErrorMsg('You do not have permission to edit this group.');
                return;
            }
            setEditMode(true);
        });
    }

    // Save button click handler
    if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveChanges();
        });
    }

    // Initialize the page
    if (groupId) {
        loadGroup();
    } else {
        showErrorMsg('No group ID provided. Please go back and try again.');
    }
});