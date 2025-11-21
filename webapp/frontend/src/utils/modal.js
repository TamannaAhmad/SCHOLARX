/**
 * Modal utility for creating and managing modals
 */

export function createModal(options = {}) {
    const {
        title = 'Modal',
        content = '',
        showCancel = true,
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        onConfirm = () => {},
        onCancel = () => {},
        maxWidth = '500px'
    } = options;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'modal-container';
    modal.style.cssText = `
        background: white;
        border-radius: 0.5rem;
        padding: 1.5rem;
        max-width: ${maxWidth};
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        animation: slideUp 0.3s ease;
    `;

    // Create modal header
    const header = document.createElement('div');
    header.style.cssText = `
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e5e7eb;
    `;
    
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.cssText = `
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    `;
    header.appendChild(titleEl);

    // Create modal body
    const body = document.createElement('div');
    body.innerHTML = content;

    // Create modal footer
    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmText;
    confirmBtn.className = 'primary-btn';
    confirmBtn.style.cssText = `
        padding: 0.5rem 1rem;
        min-width: 100px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = cancelText;
    cancelBtn.className = 'secondary-btn';
    cancelBtn.style.cssText = `
        padding: 0.5rem 1rem;
        min-width: 100px;
    `;

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });

    cancelBtn.addEventListener('click', () => {
        onCancel();
        closeModal();
    });

    if (showCancel) {
        footer.appendChild(cancelBtn);
    }
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Add to document
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            onCancel();
            closeModal();
        }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            onCancel();
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    function closeModal() {
        overlay.style.animation = 'fadeOut 0.2s ease';
        modal.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 300);
    }

    // Add CSS animations if not already added
    if (!document.getElementById('modal-styles')) {
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes slideDown {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(20px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    return {
        close: closeModal,
        overlay,
        modal,
        body
    };
}

export function createMessageModal(onConfirm, options = {}) {
    const {
        title = 'Send Message',
        label = 'Message (optional)',
        placeholder = 'Enter your message here...',
        confirmText = 'Send'
    } = options;
    
    return createModal({
        title: title,
        content: `
            <div style="margin-bottom: 1rem;">
                <label for="invite-message" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151;">
                    ${label}
                </label>
                <textarea 
                    id="invite-message" 
                    placeholder="${placeholder}"
                    rows="4"
                    style="width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.375rem; font-family: inherit; font-size: 0.875rem; resize: vertical;"
                ></textarea>
            </div>
        `,
        confirmText: confirmText,
        cancelText: 'Cancel',
        onConfirm: () => {
            const messageEl = document.getElementById('invite-message');
            const message = messageEl ? messageEl.value.trim() : '';
            onConfirm(message);
        },
        maxWidth: '600px'
    });
}

export function createInviteModal(onConfirm, options = {}) {
    const {
        title = 'Invite to Join',
        label = 'Message to User (optional)',
        placeholder = 'Add an optional message to the user',
        confirmText = 'Send Invitation'
    } = options;
    
    return createModal({
        title: title,
        content: `
            <div style="margin-bottom: 1rem;">
                <label for="invite-message" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151;">
                    ${label}
                </label>
                <textarea 
                    id="invite-message" 
                    placeholder="${placeholder}"
                    rows="4"
                    style="width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.375rem; font-family: inherit; font-size: 0.875rem; resize: vertical;"
                ></textarea>
            </div>
        `,
        confirmText: confirmText,
        cancelText: 'Cancel',
        onConfirm: () => {
            const messageEl = document.getElementById('invite-message');
            const message = messageEl ? messageEl.value.trim() : '';
            onConfirm(message);
        },
        maxWidth: '600px'
    });
}

