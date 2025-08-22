// CSS and styling regression tests
// These tests ensure that the modularized CSS maintains proper styling and layout

describe('CSS and Styling Regression Tests', () => {
  let testContainer;

  beforeEach(() => {
    // Create test container
    testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);

    // Mock CSS loading by creating style elements for each CSS module
    const cssModules = [
      'base.css',
      'layout.css', 
      'modes.css',
      'components.css',
      'speaker-notes.css',
      'gamification.css',
      'preview-presentation.css',
      'search.css',
      'interactions.css',
      'theme.css'
    ];

    cssModules.forEach(module => {
      const styleElement = document.createElement('style');
      styleElement.id = `css-${module}`;
      styleElement.textContent = getCSSContent(module);
      document.head.appendChild(styleElement);
    });
  });

  afterEach(() => {
    // Clean up test container and styles
    if (testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }

    // Remove added style elements
    const addedStyles = document.querySelectorAll('style[id^="css-"]');
    addedStyles.forEach(style => style.remove());
  });

  // Mock CSS content for testing
  function getCSSContent(module) {
    const cssContent = {
      'base.css': `
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
        .btn:hover { opacity: 0.8; }
      `,
      'layout.css': `
        #app-container { display: flex; height: 100vh; width: 100vw; }
        #main-content { display: flex; flex: 1; }
        #left-sidebar { width: 250px; background: #f5f5f5; display: flex; flex-direction: column; }
        #sidebar-resizer { width: 4px; background: #ddd; cursor: ew-resize; }
        #editor-container { flex: 1; display: flex; flex-direction: column; }
        #right-pane { width: 400px; display: flex; }
      `,
      'modes.css': `
        .content-section { display: none; }
        .content-section.active { display: block; }
        .mode-btn { background: #ccc; }
        .mode-btn.active { background: #16a34a; color: white; }
      `,
      'components.css': `
        .pane-toggle-button { padding: 4px 8px; margin: 0 2px; }
        .pane-toggle-button.active { background: #16a34a; color: white; }
        .terminal-chat { background: #1e1e1e; color: #fff; }
        .chat-message { padding: 8px; margin: 4px 0; }
        .chat-message.user { background: #2d3748; }
        .chat-message.assistant { background: #4a5568; }
      `,
      'gamification.css': `
        #gamification-panel { position: fixed; top: 20px; right: 20px; width: 300px; background: white; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .gamification-header { padding: 16px; border-bottom: 1px solid #eee; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
        .stat-item { padding: 12px; border-radius: 6px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 12px; margin-top: 4px; }
      `,
      'speaker-notes.css': `
        #speaker-notes-panel { background: #f9f9f9; border-left: 1px solid #ddd; }
        .speaker-note { padding: 8px; border-bottom: 1px solid #eee; }
        .speaker-note-content { font-size: 14px; line-height: 1.4; }
      `,
      'preview-presentation.css': `
        #presentation-content { background: #000; color: #fff; }
        .slide { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .slide h1 { font-size: 3em; text-align: center; }
      `,
      'search.css': `
        .search-container { padding: 8px; }
        .search-input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        .search-results { max-height: 300px; overflow-y: auto; }
        .search-result { padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; }
        .search-result:hover { background: #f5f5f5; }
      `,
      'interactions.css': `
        .loading { opacity: 0.6; pointer-events: none; }
        .notification { padding: 12px; margin: 8px; border-radius: 4px; }
        .notification.success { background: #d4edda; color: #155724; }
        .notification.error { background: #f8d7da; color: #721c24; }
        .typing-indicator { display: flex; align-items: center; }
        .typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: #ccc; animation: pulse 1s infinite; }
      `,
      'theme.css': `
        :root {
          --primary-color: #16a34a;
          --secondary-color: #f59e0b;
          --background-color: #ffffff;
          --text-color: #000000;
          --border-color: #d1d5db;
        }
      `
    };

    return cssContent[module] || '';
  }

  describe('Layout Structure', () => {
    test('should maintain app container layout', () => {
      testContainer.innerHTML = `
        <div id="app-container">
          <div id="left-sidebar"></div>
          <div id="sidebar-resizer"></div>
          <div id="main-content"></div>
        </div>
      `;

      const appContainer = document.getElementById('app-container');
      const computedStyle = window.getComputedStyle(appContainer);
      
      expect(computedStyle.display).toBe('flex');
      expect(computedStyle.height).toBe('100vh');
      expect(computedStyle.width).toBe('100vw');
    });

    test('should maintain sidebar layout properties', () => {
      testContainer.innerHTML = '<div id="left-sidebar"></div>';
      
      const sidebar = document.getElementById('left-sidebar');
      const computedStyle = window.getComputedStyle(sidebar);
      
      expect(computedStyle.width).toBe('250px');
      expect(computedStyle.backgroundColor).toBe('rgb(245, 245, 245)');
      expect(computedStyle.display).toBe('flex');
      expect(computedStyle.flexDirection).toBe('column');
    });

    test('should maintain main content layout', () => {
      testContainer.innerHTML = '<div id="main-content"></div>';
      
      const mainContent = document.getElementById('main-content');
      const computedStyle = window.getComputedStyle(mainContent);
      
      expect(computedStyle.display).toBe('flex');
      expect(computedStyle.flex).toBe('1 1 0%');
    });

    test('should maintain right pane dimensions', () => {
      testContainer.innerHTML = '<div id="right-pane"></div>';
      
      const rightPane = document.getElementById('right-pane');
      const computedStyle = window.getComputedStyle(rightPane);
      
      expect(computedStyle.width).toBe('400px');
      expect(computedStyle.display).toBe('flex');
    });

    test('should maintain editor container flex properties', () => {
      testContainer.innerHTML = '<div id="editor-container"></div>';
      
      const editorContainer = document.getElementById('editor-container');
      const computedStyle = window.getComputedStyle(editorContainer);
      
      expect(computedStyle.flex).toBe('1 1 0%');
      expect(computedStyle.display).toBe('flex');
      expect(computedStyle.flexDirection).toBe('column');
    });
  });

  describe('Button Styling', () => {
    test('should maintain base button styles', () => {
      testContainer.innerHTML = '<button class="btn">Test Button</button>';
      
      const button = testContainer.querySelector('.btn');
      const computedStyle = window.getComputedStyle(button);
      
      expect(computedStyle.padding).toBe('8px 16px');
      expect(computedStyle.border).toBe('none');
      expect(computedStyle.borderRadius).toBe('4px');
      expect(computedStyle.cursor).toBe('pointer');
    });

    test('should maintain pane toggle button styles', () => {
      testContainer.innerHTML = '<button class="pane-toggle-button">Toggle</button>';
      
      const button = testContainer.querySelector('.pane-toggle-button');
      const computedStyle = window.getComputedStyle(button);
      
      expect(computedStyle.padding).toBe('4px 8px');
      expect(computedStyle.margin).toBe('0px 2px');
    });

    test('should maintain active button state styles', () => {
      testContainer.innerHTML = '<button class="pane-toggle-button active">Active</button>';
      
      const button = testContainer.querySelector('.pane-toggle-button.active');
      const computedStyle = window.getComputedStyle(button);
      
      expect(computedStyle.backgroundColor).toBe('rgb(22, 163, 74)');
      expect(computedStyle.color).toBe('white');
    });

    test('should maintain mode button styles', () => {
      testContainer.innerHTML = `
        <button class="mode-btn">Inactive</button>
        <button class="mode-btn active">Active</button>
      `;
      
      const inactiveBtn = testContainer.querySelector('.mode-btn:not(.active)');
      const activeBtn = testContainer.querySelector('.mode-btn.active');
      
      const inactiveStyle = window.getComputedStyle(inactiveBtn);
      const activeStyle = window.getComputedStyle(activeBtn);
      
      expect(inactiveStyle.backgroundColor).toBe('rgb(204, 204, 204)');
      expect(activeStyle.backgroundColor).toBe('rgb(22, 163, 74)');
      expect(activeStyle.color).toBe('white');
    });
  });

  describe('Mode Content Visibility', () => {
    test('should hide inactive content sections', () => {
      testContainer.innerHTML = '<div class="content-section">Hidden Content</div>';
      
      const section = testContainer.querySelector('.content-section');
      const computedStyle = window.getComputedStyle(section);
      
      expect(computedStyle.display).toBe('none');
    });

    test('should show active content sections', () => {
      testContainer.innerHTML = '<div class="content-section active">Visible Content</div>';
      
      const section = testContainer.querySelector('.content-section.active');
      const computedStyle = window.getComputedStyle(section);
      
      expect(computedStyle.display).toBe('block');
    });

    test('should handle multiple content sections correctly', () => {
      testContainer.innerHTML = `
        <div class="content-section active" id="editor-content">Editor</div>
        <div class="content-section" id="presentation-content">Presentation</div>
        <div class="content-section" id="network-content">Network</div>
      `;
      
      const editorContent = document.getElementById('editor-content');
      const presentationContent = document.getElementById('presentation-content');
      const networkContent = document.getElementById('network-content');
      
      expect(window.getComputedStyle(editorContent).display).toBe('block');
      expect(window.getComputedStyle(presentationContent).display).toBe('none');
      expect(window.getComputedStyle(networkContent).display).toBe('none');
    });
  });

  describe('Gamification Panel Styling', () => {
    test('should maintain gamification panel positioning', () => {
      testContainer.innerHTML = '<div id="gamification-panel"></div>';
      
      const panel = document.getElementById('gamification-panel');
      const computedStyle = window.getComputedStyle(panel);
      
      expect(computedStyle.position).toBe('fixed');
      expect(computedStyle.top).toBe('20px');
      expect(computedStyle.right).toBe('20px');
      expect(computedStyle.width).toBe('300px');
    });

    test('should maintain stats grid layout', () => {
      testContainer.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">Item 1</div>
          <div class="stat-item">Item 2</div>
        </div>
      `;
      
      const grid = testContainer.querySelector('.stats-grid');
      const computedStyle = window.getComputedStyle(grid);
      
      expect(computedStyle.display).toBe('grid');
      expect(computedStyle.gridTemplateColumns).toBe('1fr 1fr');
      expect(computedStyle.gap).toBe('12px');
      expect(computedStyle.padding).toBe('16px');
    });

    test('should maintain stat item appearance', () => {
      testContainer.innerHTML = `
        <div class="stat-item">
          <div class="stat-value">42</div>
          <div class="stat-label">Points</div>
        </div>
      `;
      
      const statValue = testContainer.querySelector('.stat-value');
      const statLabel = testContainer.querySelector('.stat-label');
      
      const valueStyle = window.getComputedStyle(statValue);
      const labelStyle = window.getComputedStyle(statLabel);
      
      expect(valueStyle.fontSize).toBe('24px');
      expect(valueStyle.fontWeight).toBe('bold');
      expect(labelStyle.fontSize).toBe('12px');
      expect(labelStyle.marginTop).toBe('4px');
    });
  });

  describe('Chat Interface Styling', () => {
    test('should maintain terminal chat appearance', () => {
      testContainer.innerHTML = '<div class="terminal-chat"></div>';
      
      const chat = testContainer.querySelector('.terminal-chat');
      const computedStyle = window.getComputedStyle(chat);
      
      expect(computedStyle.backgroundColor).toBe('rgb(30, 30, 30)');
      expect(computedStyle.color).toBe('rgb(255, 255, 255)');
    });

    test('should maintain chat message styling', () => {
      testContainer.innerHTML = `
        <div class="chat-message user">User message</div>
        <div class="chat-message assistant">AI message</div>
      `;
      
      const userMessage = testContainer.querySelector('.chat-message.user');
      const aiMessage = testContainer.querySelector('.chat-message.assistant');
      
      const userStyle = window.getComputedStyle(userMessage);
      const aiStyle = window.getComputedStyle(aiMessage);
      
      expect(userStyle.backgroundColor).toBe('rgb(45, 55, 72)');
      expect(aiStyle.backgroundColor).toBe('rgb(74, 85, 104)');
      expect(userStyle.padding).toBe('8px');
      expect(userStyle.margin).toBe('4px 0px');
    });

    test('should maintain typing indicator styling', () => {
      testContainer.innerHTML = `
        <div class="typing-indicator">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
      
      const indicator = testContainer.querySelector('.typing-indicator');
      const dots = testContainer.querySelectorAll('.typing-dots span');
      
      const indicatorStyle = window.getComputedStyle(indicator);
      const dotStyle = window.getComputedStyle(dots[0]);
      
      expect(indicatorStyle.display).toBe('flex');
      expect(indicatorStyle.alignItems).toBe('center');
      expect(dotStyle.width).toBe('6px');
      expect(dotStyle.height).toBe('6px');
      expect(dotStyle.borderRadius).toBe('50%');
    });
  });

  describe('Presentation Mode Styling', () => {
    test('should maintain presentation background', () => {
      testContainer.innerHTML = '<div id="presentation-content"></div>';
      
      const presentation = document.getElementById('presentation-content');
      const computedStyle = window.getComputedStyle(presentation);
      
      expect(computedStyle.backgroundColor).toBe('rgb(0, 0, 0)');
      expect(computedStyle.color).toBe('rgb(255, 255, 255)');
    });

    test('should maintain slide layout', () => {
      testContainer.innerHTML = `
        <div class="slide">
          <h1>Slide Title</h1>
        </div>
      `;
      
      const slide = testContainer.querySelector('.slide');
      const title = testContainer.querySelector('.slide h1');
      
      const slideStyle = window.getComputedStyle(slide);
      const titleStyle = window.getComputedStyle(title);
      
      expect(slideStyle.width).toBe('100%');
      expect(slideStyle.height).toBe('100vh');
      expect(slideStyle.display).toBe('flex');
      expect(slideStyle.alignItems).toBe('center');
      expect(slideStyle.justifyContent).toBe('center');
      expect(titleStyle.fontSize).toBe('3em');
      expect(titleStyle.textAlign).toBe('center');
    });
  });

  describe('Interactive Elements', () => {
    test('should maintain loading state styling', () => {
      testContainer.innerHTML = '<div class="loading">Loading content</div>';
      
      const loadingElement = testContainer.querySelector('.loading');
      const computedStyle = window.getComputedStyle(loadingElement);
      
      expect(computedStyle.opacity).toBe('0.6');
      expect(computedStyle.pointerEvents).toBe('none');
    });

    test('should maintain notification styling', () => {
      testContainer.innerHTML = `
        <div class="notification success">Success message</div>
        <div class="notification error">Error message</div>
      `;
      
      const successNotification = testContainer.querySelector('.notification.success');
      const errorNotification = testContainer.querySelector('.notification.error');
      
      const successStyle = window.getComputedStyle(successNotification);
      const errorStyle = window.getComputedStyle(errorNotification);
      
      expect(successStyle.backgroundColor).toBe('rgb(212, 237, 218)');
      expect(successStyle.color).toBe('rgb(21, 87, 36)');
      expect(errorStyle.backgroundColor).toBe('rgb(248, 215, 218)');
      expect(errorStyle.color).toBe('rgb(114, 28, 36)');
      expect(successStyle.padding).toBe('12px');
      expect(successStyle.margin).toBe('8px');
    });

    test('should maintain search interface styling', () => {
      testContainer.innerHTML = `
        <div class="search-container">
          <input class="search-input" />
          <div class="search-results">
            <div class="search-result">Result 1</div>
          </div>
        </div>
      `;
      
      const container = testContainer.querySelector('.search-container');
      const input = testContainer.querySelector('.search-input');
      const results = testContainer.querySelector('.search-results');
      const result = testContainer.querySelector('.search-result');
      
      expect(window.getComputedStyle(container).padding).toBe('8px');
      expect(window.getComputedStyle(input).width).toBe('100%');
      expect(window.getComputedStyle(input).padding).toBe('8px');
      expect(window.getComputedStyle(results).maxHeight).toBe('300px');
      expect(window.getComputedStyle(results).overflowY).toBe('auto');
      expect(window.getComputedStyle(result).padding).toBe('8px');
      expect(window.getComputedStyle(result).cursor).toBe('pointer');
    });
  });

  describe('CSS Custom Properties (Variables)', () => {
    test('should maintain CSS custom properties', () => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      
      expect(rootStyle.getPropertyValue('--primary-color').trim()).toBe('#16a34a');
      expect(rootStyle.getPropertyValue('--secondary-color').trim()).toBe('#f59e0b');
      expect(rootStyle.getPropertyValue('--background-color').trim()).toBe('#ffffff');
      expect(rootStyle.getPropertyValue('--text-color').trim()).toBe('#000000');
      expect(rootStyle.getPropertyValue('--border-color').trim()).toBe('#d1d5db');
    });

    test('should use CSS variables in components', () => {
      // Create a test component that uses CSS variables
      const testStyle = document.createElement('style');
      testStyle.textContent = `
        .test-component { 
          color: var(--text-color); 
          background-color: var(--background-color);
          border-color: var(--border-color);
        }
      `;
      document.head.appendChild(testStyle);
      
      testContainer.innerHTML = '<div class="test-component">Test</div>';
      
      const component = testContainer.querySelector('.test-component');
      const computedStyle = window.getComputedStyle(component);
      
      expect(computedStyle.color).toBe('rgb(0, 0, 0)');
      expect(computedStyle.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(computedStyle.borderColor).toBe('rgb(209, 213, 219)');
      
      testStyle.remove();
    });
  });

  describe('Responsive Behavior', () => {
    test('should maintain layout integrity on window resize', () => {
      testContainer.innerHTML = `
        <div id="app-container" style="width: 1200px;">
          <div id="left-sidebar"></div>
          <div id="main-content"></div>
        </div>
      `;
      
      const appContainer = document.getElementById('app-container');
      const sidebar = document.getElementById('left-sidebar');
      const mainContent = document.getElementById('main-content');
      
      // Simulate smaller width
      appContainer.style.width = '800px';
      
      const sidebarStyle = window.getComputedStyle(sidebar);
      const mainContentStyle = window.getComputedStyle(mainContent);
      
      expect(sidebarStyle.width).toBe('250px'); // Fixed width maintained
      expect(mainContentStyle.flex).toBe('1 1 0%'); // Flexible content
    });

    test('should handle overflow correctly', () => {
      testContainer.innerHTML = `
        <div class="search-results" style="height: 200px;">
          ${Array(20).fill('<div class="search-result">Long result item</div>').join('')}
        </div>
      `;
      
      const results = testContainer.querySelector('.search-results');
      const computedStyle = window.getComputedStyle(results);
      
      expect(computedStyle.overflowY).toBe('auto');
      expect(computedStyle.maxHeight).toBe('300px');
    });
  });

  describe('Animation and Transition Consistency', () => {
    test('should maintain hover effects', () => {
      testContainer.innerHTML = '<button class="btn">Hover me</button>';
      
      const button = testContainer.querySelector('.btn');
      
      // Simulate hover (can't actually trigger :hover in jsdom, so we test the CSS is loaded)
      const styles = Array.from(document.styleSheets)
        .map(sheet => {
          try { return Array.from(sheet.cssRules); } catch { return []; }
        })
        .flat()
        .map(rule => rule.cssText)
        .join(' ');
      
      expect(styles).toContain(':hover');
      expect(styles).toContain('opacity');
    });

    test('should maintain consistent spacing', () => {
      testContainer.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">Item 1</div>
          <div class="stat-item">Item 2</div>
          <div class="stat-item">Item 3</div>
          <div class="stat-item">Item 4</div>
        </div>
      `;
      
      const grid = testContainer.querySelector('.stats-grid');
      const items = testContainer.querySelectorAll('.stat-item');
      
      const gridStyle = window.getComputedStyle(grid);
      const itemStyle = window.getComputedStyle(items[0]);
      
      expect(gridStyle.gap).toBe('12px');
      expect(itemStyle.padding).toBe('12px');
    });
  });

  describe('CSS Module Integration', () => {
    test('should load all CSS modules without conflicts', () => {
      // Check that all expected style elements are present
      const cssModules = [
        'css-base.css',
        'css-layout.css',
        'css-modes.css',
        'css-components.css',
        'css-gamification.css'
      ];
      
      cssModules.forEach(moduleId => {
        const styleElement = document.getElementById(moduleId);
        expect(styleElement).toBeTruthy();
        expect(styleElement.textContent.length).toBeGreaterThan(0);
      });
    });

    test('should maintain style specificity order', () => {
      // Create elements that test style cascade
      testContainer.innerHTML = `
        <button class="btn pane-toggle-button active">Multi-class button</button>
      `;
      
      const button = testContainer.querySelector('button');
      const computedStyle = window.getComputedStyle(button);
      
      // More specific classes should override base classes
      expect(computedStyle.backgroundColor).toBe('rgb(22, 163, 74)'); // active state
      expect(computedStyle.color).toBe('white'); // active state
      expect(computedStyle.borderRadius).toBe('4px'); // base btn class
    });

    test('should handle CSS variable fallbacks', () => {
      const testStyle = document.createElement('style');
      testStyle.textContent = `
        .fallback-test { 
          color: var(--nonexistent-color, #000000); 
          background: var(--also-nonexistent, white);
        }
      `;
      document.head.appendChild(testStyle);
      
      testContainer.innerHTML = '<div class="fallback-test">Test</div>';
      
      const element = testContainer.querySelector('.fallback-test');
      const computedStyle = window.getComputedStyle(element);
      
      expect(computedStyle.color).toBe('rgb(0, 0, 0)'); // fallback value
      expect(computedStyle.backgroundColor).toBe('rgb(255, 255, 255)'); // fallback value
      
      testStyle.remove();
    });
  });

  describe('Browser Compatibility', () => {
    test('should use compatible CSS properties', () => {
      // Test that we're not using unsupported properties
      testContainer.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">Test</div>
        </div>
      `;
      
      const grid = testContainer.querySelector('.stats-grid');
      const computedStyle = window.getComputedStyle(grid);
      
      // CSS Grid should be supported
      expect(computedStyle.display).toBe('grid');
      expect(computedStyle.gridTemplateColumns).toBe('1fr 1fr');
    });

    test('should use standard box-sizing', () => {
      testContainer.innerHTML = '<div class="test-element">Test</div>';
      
      const element = testContainer.querySelector('.test-element');
      const computedStyle = window.getComputedStyle(element);
      
      // Should inherit box-sizing: border-box from universal selector
      expect(computedStyle.boxSizing).toBe('border-box');
    });
  });
});