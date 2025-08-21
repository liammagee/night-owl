// === DOM Helper Utilities ===
// Common patterns for DOM manipulation and modal creation

/**
 * Creates a standardized modal dialog structure
 * @param {Object} config - Modal configuration
 * @param {string} config.id - Modal ID
 * @param {string} config.title - Modal title
 * @param {Function} config.onClose - Close handler
 * @param {Function} config.onSave - Save handler (optional)
 * @param {boolean} config.showFooter - Whether to show footer (default: true)
 * @returns {Object} Modal elements { modal, header, body, footer }
 */
function createModal(config) {
    const {
        id,
        title,
        onClose,
        onSave,
        showFooter = true
    } = config;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay';
    
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    titleElement.className = 'modal-title';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'modal-close';
    closeBtn.onclick = onClose;
    
    header.appendChild(titleElement);
    header.appendChild(closeBtn);
    
    // Create body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    // Create footer (if needed)
    let footer = null;
    if (showFooter) {
        footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.onclick = onClose;
        
        footer.appendChild(cancelBtn);
        
        if (onSave) {
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.className = 'btn btn-primary';
            saveBtn.onclick = onSave;
            footer.appendChild(saveBtn);
        }
    }
    
    // Assemble modal
    dialog.appendChild(header);
    dialog.appendChild(body);
    if (footer) {
        dialog.appendChild(footer);
    }
    modal.appendChild(dialog);
    
    return { modal, header, body, footer };
}

/**
 * Shows a modal with body scroll prevention
 * @param {HTMLElement} modal - The modal element to show
 */
function showModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Hides a modal and restores body scroll
 * @param {HTMLElement} modal - The modal element to hide
 */
function hideModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Creates a button element with standardized styling
 * @param {Object} config - Button configuration
 * @param {string} config.text - Button text
 * @param {string} config.className - CSS class name
 * @param {Function} config.onClick - Click handler
 * @param {Object} config.style - Inline styles (optional)
 * @returns {HTMLButtonElement} The button element
 */
function createButton(config) {
    const { text, className, onClick, style = {} } = config;
    
    const button = document.createElement('button');
    button.textContent = text;
    button.className = className;
    button.onclick = onClick;
    
    // Apply inline styles if provided
    Object.assign(button.style, style);
    
    return button;
}

/**
 * Creates a form input group with label
 * @param {Object} config - Input configuration
 * @param {string} config.label - Label text
 * @param {string} config.type - Input type
 * @param {string} config.id - Input ID
 * @param {string} config.value - Initial value
 * @param {string} config.placeholder - Placeholder text
 * @returns {HTMLDivElement} The input group container
 */
function createInputGroup(config) {
    const { label, type, id, value = '', placeholder = '' } = config;
    
    const group = document.createElement('div');
    group.className = 'input-group';
    
    if (label) {
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.htmlFor = id;
        group.appendChild(labelElement);
    }
    
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.value = value;
    input.placeholder = placeholder;
    input.className = 'form-input';
    
    group.appendChild(input);
    
    return group;
}

/**
 * Creates a select dropdown with options
 * @param {Object} config - Select configuration
 * @param {string} config.label - Label text
 * @param {string} config.id - Select ID
 * @param {Array} config.options - Array of {value, text} objects
 * @param {string} config.selectedValue - Initially selected value
 * @returns {HTMLDivElement} The select group container
 */
function createSelectGroup(config) {
    const { label, id, options, selectedValue } = config;
    
    const group = document.createElement('div');
    group.className = 'input-group';
    
    if (label) {
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.htmlFor = id;
        group.appendChild(labelElement);
    }
    
    const select = document.createElement('select');
    select.id = id;
    select.className = 'form-select';
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        if (option.value === selectedValue) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });
    
    group.appendChild(select);
    
    return group;
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export {
    createModal,
    showModal,
    hideModal,
    createButton,
    createInputGroup,
    createSelectGroup,
    debounce
};