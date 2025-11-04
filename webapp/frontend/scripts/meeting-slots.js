document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const entityId = params.get('id');
    const entityType = params.get('type') || 'study-group';
    const backBtn = document.getElementById('backBtn');
    const slotsContainer = document.getElementById('slots-container');
    const noSlots = document.getElementById('no-slots');
    const loading = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');
    const pageTitle = document.getElementById('page-title');

    // Set up back button
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const backUrl = entityType === 'project' 
                ? `project-view.html?id=${entityId}`
                : `study-group-view.html?id=${entityId}`;
            window.location.href = backUrl;
        });
        
        // Update button text based on type
        backBtn.textContent = entityType === 'project' ? 'BACK TO PROJECT' : 'BACK TO GROUP';
    }

    // Update page title
    if (pageTitle) {
        pageTitle.textContent = entityType === 'project' 
            ? 'PROJECT MEETING SLOTS' 
            : 'STUDY GROUP MEETING SLOTS';
    }

    // Function to show error message
    function showErrorMsg(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            loading.style.display = 'none';
            slotsContainer.style.display = 'none';
            noSlots.style.display = 'none';
        }
        console.error(message);
    }

    // Function to group slots by day
    function groupSlotsByDay(slots) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const grouped = {};
        
        // Initialize empty arrays for each day
        days.forEach(day => {
            grouped[day] = [];
        });
        
        // Group slots by day
        slots.forEach(slot => {
            const dayName = slot.day_name;
            if (dayName && grouped[dayName] !== undefined) {
                grouped[dayName].push(slot);
            }
        });
        
        // Sort slots within each day by start time
        Object.keys(grouped).forEach(day => {
            grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
        });
        
        return grouped;
    }

    // Function to render time slots
    function renderTimeSlots(perfectSlots = [], goodSlots = [], backupSlots = []) {
        const slotsContainer = document.getElementById('time-slots');
        slotsContainer.innerHTML = '';

        const allSlots = [
            { slots: perfectSlots, title: 'Perfect Slots (100% Available)', className: 'perfect-slot' },
            { slots: goodSlots, title: 'Good Slots (80%+ Available)', className: 'good-slot' },
            { slots: backupSlots, title: 'Backup Slots (50%+ Available)', className: 'backup-slot' }
        ];

        let hasSlots = false;

        allSlots.forEach(({ slots, title, className }) => {
            if (slots && slots.length > 0) {
                hasSlots = true;
                const section = document.createElement('div');
                section.className = `time-slot-section ${className}`;
                section.innerHTML = `<h3>${title}</h3>`;
                
                // Group slots by day
                const groupedSlots = groupSlotsByDay(slots);
                let hasDaySlots = false;
                
                // Create a container for all days
                const daysContainer = document.createElement('div');
                daysContainer.className = 'days-container';
                
                // Iterate through each day in order
                const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                dayOrder.forEach(day => {
                    const daySlots = groupedSlots[day] || [];
                    if (daySlots.length > 0) {
                        hasDaySlots = true;
                        
                        const daySection = document.createElement('div');
                        daySection.className = 'day-section';
                        daySection.innerHTML = `<h4 class="day-header">${day}</h4>`;
                        
                        const slotList = document.createElement('div');
                        slotList.className = 'slot-list';
                        
                        daySlots.forEach(slot => {
                            const slotElement = document.createElement('div');
                            slotElement.className = `time-slot ${className}`;
                            
                            slotElement.innerHTML = `
                                <div class="slot-content">
                                    <div class="time-range">${slot.start_time} - ${slot.end_time}</div>
                                    <div class="availability-percent">${slot.availability_percentage}%</div>
                                    <div class="availability-details">${slot.available_count}/${slot.total_members} available</div>
                                </div>
                            `;
                            
                            slotList.appendChild(slotElement);
                        });
                        
                        daySection.appendChild(slotList);
                        daysContainer.appendChild(daySection);
                    }
                });
                
                if (hasDaySlots) {
                    section.appendChild(daysContainer);
                    slotsContainer.appendChild(section);
                }
            }
        });

        if (!hasSlots) {
            noSlots.style.display = 'block';
            slotsContainer.style.display = 'none';
        } else {
            noSlots.style.display = 'none';
            slotsContainer.style.display = 'block';
        }
        
        loading.style.display = 'none';
    }

    // Function to fetch optimal meeting times from the API
    async function fetchOptimalMeetingTimes() {
        if (!entityId) {
            showErrorMsg('No ID provided in the URL');
            return;
        }

        try {
            // Get the authentication token from localStorage
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('Not authenticated. Please log in.');
            }

            // Make API call to get meeting slots
            const response = await fetch(
                `/api/projects/${entityType}/${entityId}/meeting-slots/`,
                {
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to fetch meeting slots');
            }

            const data = await response.json();
            
            // Show the slots container and hide loading
            document.getElementById('slots-container').style.display = 'block';
            loading.style.display = 'none';
            
            // Render the slots
            renderTimeSlots(
                data.perfect_slots || [],
                data.good_slots || [],
                data.backup_slots || []
            );
            
            // Show recommendation and success rate if available
            if (data.recommendation) {
                const recommendationEl = document.createElement('div');
                recommendationEl.className = 'recommendation';
                
                let recommendationHTML = `
                    <div class="recommendation-content">
                        <span class="recommendation-text">${data.recommendation}</span>
                        <div class="stats-summary">
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.perfect_count || 0}</span>
                                <span class="stat-label">Perfect</span>
                            </span>
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.good_count || 0}</span>
                                <span class="stat-label">Good</span>
                            </span>
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.backup_count || 0}</span>
                                <span class="stat-label">Backup</span>
                            </span>
                            <span class="stat-item success-rate">
                                <span class="stat-value">${data.stats.success_rate || 0}%</span>
                                <span class="stat-label">Success Rate</span>
                            </span>
                        </div>
                    </div>
                `;
                
                recommendationEl.innerHTML = recommendationHTML;
                document.querySelector('.meeting-slots-container').prepend(recommendationEl);
            }
            
        } catch (error) {
            console.error('Error rendering time slots:', error);
            showErrorMsg('Failed to render time slots. Please try again.');
        }
    }

    // Function to fetch optimal meeting times from the API
    async function fetchOptimalMeetingTimes() {
        if (!entityId) {
            showErrorMsg('No ID provided in the URL');
            return;
        }

        try {
            // Get the authentication token from localStorage
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('Not authenticated. Please log in.');
            }

            // Make API call to get meeting slots
            const response = await fetch(
                `/api/projects/${entityType}/${entityId}/meeting-slots/`,
                {
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to fetch meeting slots');
            }

            const data = await response.json();
            
            // Show the slots container and hide loading
            document.getElementById('slots-container').style.display = 'block';
            loading.style.display = 'none';
            
            // Render the slots
            renderTimeSlots(
                data.perfect_slots || [],
                data.good_slots || [],
                data.backup_slots || []
            );
            
            // Show recommendation and success rate if available
            if (data.recommendation) {
                const recommendationEl = document.createElement('div');
                recommendationEl.className = 'recommendation';
                
                let recommendationHTML = `
                    <div class="recommendation-content">
                        <span class="recommendation-text">${data.recommendation}</span>
                        <div class="stats-summary">
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.perfect_count || 0}</span>
                                <span class="stat-label">Perfect</span>
                            </span>
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.good_count || 0}</span>
                                <span class="stat-label">Good</span>
                            </span>
                            <span class="stat-item">
                                <span class="stat-value">${data.stats.backup_count || 0}</span>
                                <span class="stat-label">Backup</span>
                            </span>
                            <span class="stat-item success-rate">
                                <span class="stat-value">${data.stats.success_rate || 0}%</span>
                                <span class="stat-label">Success Rate</span>
                            </span>
                        </div>
                    </div>
                `;
                
                recommendationEl.innerHTML = recommendationHTML;
                document.querySelector('.meeting-slots-container').prepend(recommendationEl);
            }
            
        } catch (error) {
            console.error('Error fetching meeting slots:', error);
            showErrorMsg(error.message || 'Failed to load meeting times. Please try again.');
        }
    }

    // Initialize the page
    if (entityId) {
        fetchOptimalMeetingTimes();
    } else {
        showErrorMsg('No ID provided in the URL');
        loading.style.display = 'none';
    }
}); // Close the DOMContentLoaded event listener
