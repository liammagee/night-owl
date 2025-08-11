
// --- Speaker Notes Functionality ---
// Speaker notes elements
const showSpeakerNotesBtn = document.getElementById('show-speaker-notes-btn');
const speakerNotesPane = document.getElementById('speaker-notes-pane');
const speakerNotesContent = document.getElementById('speaker-notes-content');
const toggleSpeakerNotesInPreviewBtn = document.getElementById('toggle-speaker-notes-in-preview');


// Insert speaker notes template
async function insertSpeakerNotesTemplate() {
    if (!editor) {
        console.warn('[renderer.js] Cannot insert speaker notes template - no editor available');
        return;
    }
    
    const position = editor.getPosition();
    const template = '\n\n```notes\nAdd your speaker notes here.\n\nRemember to:\n- Speak clearly and at a moderate pace\n- Make eye contact with your audience\n- Pause for questions\n```\n\n';
    
    editor.executeEdits('insert-speaker-notes', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: template
    }]);
    
    // Position cursor inside the notes block
    const newPosition = {
        lineNumber: position.lineNumber + 2,
        column: 1
    };
    editor.setPosition(newPosition);
    editor.focus();
    
    updatePreviewAndStructure(editor.getValue());
    console.log('[renderer.js] Inserted speaker notes template');
}


// Update speaker notes display
function updateSpeakerNotesDisplay() {
    if (!speakerNotesContent) return;
    
    if (currentSpeakerNotes.length === 0) {
        speakerNotesContent.innerHTML = `
            <p style="color: #666; text-align: center; padding: 20px;">
                No speaker notes found.<br>
                <small>Add notes using <code>\`\`\`notes</code> blocks in your Markdown.</small>
            </p>
        `;
        return;
    }
    
    let notesHtml = '';
    currentSpeakerNotes.forEach((note, index) => {
        const noteContent = window.marked ? window.marked.parse(note.content) : note.content.replace(/\n/g, '<br>');
        notesHtml += `
            <div class="speaker-note" style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                <div class="speaker-note-header" style="font-size: 12px; color: #666; margin-bottom: 8px; font-weight: bold;">
                    📝 Note ${index + 1}
                </div>
                <div class="speaker-note-content" style="line-height: 1.6;">
                    ${noteContent}
                </div>
            </div>
        `;
    });
    
    speakerNotesContent.innerHTML = notesHtml;
    console.log(`[renderer.js] Updated speaker notes display with ${currentSpeakerNotes.length} notes`);
}

// Toggle speaker notes visibility in preview
function toggleSpeakerNotesInPreview() {
    speakerNotesVisible = !speakerNotesVisible;
    
    const placeholders = document.querySelectorAll('.speaker-notes-placeholder');
    placeholders.forEach(placeholder => {
        if (speakerNotesVisible) {
            const noteId = placeholder.getAttribute('data-note-id');
            const note = currentSpeakerNotes.find(n => n.id === noteId);
            if (note) {
                const noteContent = window.marked ? window.marked.parse(note.content) : note.content.replace(/\n/g, '<br>');
                placeholder.innerHTML = `
                    <div class="speaker-notes-preview" style="margin: 8px 0; padding: 8px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; font-size: 12px;">
                        <div style="font-weight: bold; color: #856404; margin-bottom: 4px;">📝 Speaker Notes:</div>
                        <div style="color: #856404;">${noteContent}</div>
                    </div>
                `;
                placeholder.style.display = 'block';
            }
        } else {
            placeholder.innerHTML = '';
            placeholder.style.display = 'none';
        }
    });
    
    // Update button text
    if (toggleSpeakerNotesInPreviewBtn) {
        toggleSpeakerNotesInPreviewBtn.textContent = speakerNotesVisible ? 'Hide in Preview' : 'Show in Preview';
    }
    
    console.log(`[renderer.js] Speaker notes in preview: ${speakerNotesVisible ? 'visible' : 'hidden'}`);
}

// Initialize speaker notes functionality
function initializeSpeakerNotes() {
    if (showSpeakerNotesBtn) {
        showSpeakerNotesBtn.addEventListener('click', () => {
            showRightPane('speaker-notes');
        });
    }
    
    if (toggleSpeakerNotesInPreviewBtn) {
        toggleSpeakerNotesInPreviewBtn.addEventListener('click', toggleSpeakerNotesInPreview);
    }
    
    console.log('[renderer.js] Speaker notes functionality initialized');
}

// --- Export for Global Access ---
window.insertSpeakerNotesTemplate = insertSpeakerNotesTemplate;
window.updateSpeakerNotesDisplay = updateSpeakerNotesDisplay;
window.toggleSpeakerNotesInPreview = toggleSpeakerNotesInPreview;
window.initializeSpeakerNotes = initializeSpeakerNotes;