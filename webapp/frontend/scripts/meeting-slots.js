import groupsAPI from '../src/api/groups.js';
import { showError, handleAPIError } from '../src/utils/errorHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('id');
    const backBtn = document.getElementById('backBtn');
    const slotsContainer = document.getElementById('slots-container');
    const noSlots = document.getElementById('no-slots');
    const loading = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');

    // Set up back button
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const type = params.get('type') || 'study-group'; // Default to study-group for backward compatibility
            const backUrl = type === 'project' 
                ? `project-view.html?id=${groupId}`
                : `study-group-view.html?id=${groupId}`;
            window.location.href = backUrl;
        });
        
        // Update button text based on type
        const type = params.get('type') || 'group';
        backBtn.textContent = type === 'project' ? 'BACK TO PROJECT' : 'BACK TO GROUP';
    }

    // Function to show error message
    function showErrorMsg(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            loading.style.display = 'none';
        }
        console.error(message);
    }

    // Function to render time slots
    function renderTimeSlots(slots) {
        const slotsContainer = document.getElementById('time-slots');
        slotsContainer.innerHTML = '';

        if (!slots || slots.length === 0) {
            noSlots.style.display = 'block';
            slotsContainer.style.display = 'none';
            return;
        }

        slots.forEach((slot, index) => {
            const slotElement = document.createElement('div');
            slotElement.className = 'time-slot';
            
            // Format date and time
            const date = new Date(slot.startTime);
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const startTime = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const endTime = new Date(slot.endTime).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Create slot HTML
            slotElement.innerHTML = `
                <h3>
                    <span>${formattedDate}</span>
                    <span>${startTime} - ${endTime}</span>
                </h3>
                <p>${slot.availableMembers.length} out of ${slot.totalMembers} members available</p>
                <div class="availability">
                    ${slot.availableMembers.map(member => `
                        <div class="member-availability">
                            <div class="member-avatar">${member.name.charAt(0).toUpperCase()}</div>
                            <span>${member.name}</span>
                        </div>
                    `).join('')}
                </div>
            `;

            slotsContainer.appendChild(slotElement);
        });

        loading.style.display = 'none';
        slotsContainer.style.display = 'block';
    }

    // Function to fetch optimal meeting times
    async function fetchOptimalMeetingTimes() {
        if (!groupId) {
            showErrorMsg('No group ID provided');
            return;
        }

        try {
            // In a real implementation, this would call your backend API
            // For now, we'll simulate a response
            // const response = await groupsAPI.getOptimalMeetingTimes(groupId);
            // renderTimeSlots(response.slots);

            // Simulated response (remove this in production)
            setTimeout(() => {
                const mockSlots = [
                    {
                        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 * 2).toISOString(), // 2 days from now
                        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 * 2 + 60 * 60 * 1000).toISOString(), // 1 hour later
                        availableMembers: [
                            { id: 1, name: 'Alex Johnson' },
                            { id: 2, name: 'Taylor Smith' },
                            { id: 3, name: 'Jordan Lee' }
                        ],
                        totalMembers: 5
                    },
                    {
                        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 * 3).toISOString(), // 3 days from now
                        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 * 3 + 60 * 60 * 1000).toISOString(), // 1 hour later
                        availableMembers: [
                            { id: 1, name: 'Alex Johnson' },
                            { id: 4, name: 'Casey Kim' },
                            { id: 5, name: 'Riley Taylor' }
                        ],
                        totalMembers: 5
                    }
                ];
                renderTimeSlots(mockSlots);
            }, 1000);

        } catch (error) {
            console.error('Error fetching optimal meeting times:', error);
            showErrorMsg(handleAPIError(error) || 'Failed to load meeting times. Please try again.');
            loading.style.display = 'none';
        }
    }

    // Initialize the page
    if (groupId) {
        fetchOptimalMeetingTimes();
    } else {
        showErrorMsg('No group ID provided');
        loading.style.display = 'none';
    }
});
