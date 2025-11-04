// Chatbot JavaScript
// This is a placeholder implementation ready for model integration

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Initialize chatbot
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const backBtn = document.getElementById('backBtn');
    
    // Message history storage
    let messageHistory = [];

    // Show welcome message
    showWelcomeMessage();

    // Handle back button click
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'dashboard.html';
        });
    }

    // Handle chat input submission
    if (chatInput) {
        chatInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await handleUserMessage();
            }
        });
    }

    // Function to show welcome message
    function showWelcomeMessage() {
        const welcomeMessage = createMessage(
            'bot',
            "Hello! I'm your ScholarX AI assistant. How can I help you today?",
            false
        );
        chatMessages.appendChild(welcomeMessage);
        scrollToBottom();
    }

    // Function to handle user message
    async function handleUserMessage() {
        const messageText = chatInput.value.trim();
        
        if (!messageText) {
            return;
        }

        // Clear input
        chatInput.value = '';
        chatInput.disabled = true;

        // Add user message to chat
        const userMessage = createMessage('user', messageText);
        chatMessages.appendChild(userMessage);
        scrollToBottom();

        // Add to history
        messageHistory.push({ role: 'user', content: messageText });

        // Show loading indicator
        const loadingMessage = createLoadingMessage();
        chatMessages.appendChild(loadingMessage);
        scrollToBottom();

        try {
            // TODO: Replace with actual API call when model is ready
            // Example structure for future implementation:
            // const response = await fetchChatbotResponse(messageText, messageHistory);
            
            // For now, simulate a response
            await simulateResponse(messageText);
        } catch (error) {
            console.error('Error getting chatbot response:', error);
            removeLoadingMessage();
            showErrorMessage();
        } finally {
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    // Function to simulate chatbot response (remove when model is integrated)
    async function simulateResponse(messageText) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Remove loading message
        removeLoadingMessage();
        
        // Generate a simple response based on keywords
        let botResponse = generateMockResponse(messageText);
        
        // Add bot message to chat
        const botMessage = createMessage('bot', botResponse);
        chatMessages.appendChild(botMessage);
        scrollToBottom();

        // Add to history
        messageHistory.push({ role: 'assistant', content: botResponse });
    }

    // Function to generate mock response (remove when model is integrated)
    function generateMockResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
            return "Hello! I'm here to help you with your studies and collaboration needs.";
        } else if (lowerMessage.includes('project')) {
            return "You can create and manage projects in the Projects section. Would you like to know more about creating a new project?";
        } else if (lowerMessage.includes('group') || lowerMessage.includes('study')) {
            return "Study groups are a great way to collaborate with peers. You can search for existing groups or create your own!";
        } else if (lowerMessage.includes('help')) {
            return "I can help you with:\n- Creating and managing projects\n- Finding study groups\n- Understanding ScholarX features\n- Answering questions about your profile\n\nWhat would you like to know?";
        } else if (lowerMessage.includes('thank')) {
            return "You're welcome! Feel free to ask if you need anything else.";
        } else if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
            return "Goodbye! Have a great day studying!";
        } else {
            return "I'm still learning! Once my AI model is integrated, I'll be able to provide more detailed and personalized responses. For now, I can help you navigate ScholarX features. What would you like to know?";
        }
    }

    // Function to create a chat message
    function createMessage(sender, text, animate = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = text;

        messageDiv.appendChild(bubbleDiv);
        
        if (!animate) {
            messageDiv.style.animation = 'none';
        }
        
        return messageDiv;
    }

    // Function to create loading message
    function createLoadingMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot loading';
        messageDiv.id = 'loading-message';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            typingIndicator.appendChild(dot);
        }

        bubbleDiv.appendChild(typingIndicator);
        messageDiv.appendChild(bubbleDiv);

        return messageDiv;
    }

    // Function to remove loading message
    function removeLoadingMessage() {
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }

    // Function to show error message
    function showErrorMessage() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Sorry, I encountered an error. Please try again.';
        chatMessages.appendChild(errorDiv);
        scrollToBottom();

        // Remove error message after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    // Function to scroll to bottom of chat
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Focus on input when page loads
    if (chatInput) {
        setTimeout(() => {
            chatInput.focus();
        }, 100);
    }
});

/**
 * TODO: Implement when chatbot model is ready
 * 
 * This function will handle the actual API call to the chatbot model
 * 
 * @param {string} message - The user's message
 * @param {Array} history - The conversation history
 * @returns {Promise<string>} - The chatbot's response
 */
async function fetchChatbotResponse(message, history) {
    // Example implementation structure:
    /*
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('http://127.0.0.1:8000/api/chatbot/', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: history
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get chatbot response');
        }

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Chatbot API error:', error);
        throw error;
    }
    */
}

