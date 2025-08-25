// Simple Scholar Support Test
console.log('🎓 SCHOLAR SUPPORT TEST LOADING!');
alert('Scholar support test script loaded!');

// Simple text selection handler
document.addEventListener('mouseup', () => {
    console.log('🎓 Mouse up detected');
    
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
        const text = selection.toString().trim();
        console.log('🎓 Text selected:', text.length, 'chars');
        
        if (text.length >= 10) {
            // Remove any existing button
            const existing = document.getElementById('scholar-test-btn');
            if (existing) existing.remove();
            
            // Create simple button
            const btn = document.createElement('button');
            btn.id = 'scholar-test-btn';
            btn.innerHTML = '📑 Add Heading';
            btn.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #667eea;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                z-index: 10000;
                cursor: pointer;
                font-size: 14px;
            `;
            
            btn.onclick = () => {
                alert('Would generate heading for: ' + text.substring(0, 100));
                btn.remove();
            };
            
            document.body.appendChild(btn);
            console.log('🎓 Button added to DOM');
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (document.getElementById('scholar-test-btn')) {
                    btn.remove();
                    console.log('🎓 Button auto-removed');
                }
            }, 5000);
        }
    }
});

console.log('🎓 Scholar support test initialized');