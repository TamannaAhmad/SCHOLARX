document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.querySelector('.chat-input-container');

    // Ensure all elements exist before proceeding
    if (!chatInput || !chatMessages) {
        console.error('One or more chat elements are missing');
        return;
    }

    // Show welcome message when page loads
    showWelcomeMessage();

    // Handle form submission
    if (chatForm) {
        chatForm.addEventListener('submit', handleSubmit);
    }
    
    // Also handle Enter key in input
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    });

    function showWelcomeMessage() {
        appendMessage('bot', 'Hi! I\'m your ScholarX AI Assistant. Ask me anything about your courses or VTU.');
    }

    function appendMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.style.whiteSpace = 'pre-line'; // This will preserve newlines
        
        // If the message is from the bot, we might get HTML content
        if (sender === 'bot') {
            messageBubble.innerHTML = text.replace(/\n/g, '<br>');
        } else {
            messageBubble.textContent = text;
        }
        
        messageDiv.appendChild(messageBubble);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom of messages
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot';
        typingDiv.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingDiv;
    }

    function removeTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) {
            indicator.remove();
        }
    }

    async function handleSubmit(e) {
        e?.preventDefault();
        const query = chatInput.value.trim();

        if (!query) return;

        // Add user message to chat
        appendMessage('user', query);
        chatInput.value = '';
        
        // Show typing indicator
        const typingIndicator = showTypingIndicator();
        
        try {
            const response = await fetch('/api/chatbot/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ message: query })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Remove typing indicator and add bot response
            removeTypingIndicator(typingIndicator);
            
            // Add chatbot response to chat
            if (data.response) {
                appendMessage('bot', data.response);
            } else {
                appendMessage('bot', 'I received an empty response. Could you please rephrase your question?');
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            removeTypingIndicator(typingIndicator);
            appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
        }
    }

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
});
