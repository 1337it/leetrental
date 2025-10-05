// Collapsible Sidebar for Frappe Workspaces
// Add this file to your_app/public/js/sidebar_toggle.js



    initCollapsibleSidebar();


// Also try on full page load
$(document).ready(function() {
    setTimeout(function() {
        if (!document.querySelector('.sidebar-toggle-btn')) {

            initCollapsibleSidebar();
        }
    }, 500);
});

function initCollapsibleSidebar() {
    console.log('Initializing collapsible workspace sidebar...');
    
    // Check if button already exists
    if (document.querySelector('.sidebar-toggle-btn')) {

        return;
    }
    
    // Get the workspace sidebar specifically
    const workspacePage = document.querySelector('#page-Workspaces');
    if (!workspacePage) {

        // Retry after a delay if workspace isn't loaded yet
        setTimeout(initCollapsibleSidebar, 1000);
        return;
    }
    
    const sidebar = workspacePage.querySelector('#page-Workspaces .layout-side-section');
    
    if (!sidebar) {

        return;
    }

    
    // Create hamburger button
    const hamburgerBtn = createHamburgerButton();
    
    // Insert button directly into body as first element
    document.body.insertBefore(hamburgerBtn, document.body.firstChild);
    

    
    // Load saved state
    const isCollapsed = localStorage.getItem('workspace-sidebar-collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('workspace-collapsed');
        hamburgerBtn.classList.add('active');
    }
    
    // Toggle sidebar on button click
    hamburgerBtn.addEventListener('click', function(e) {
        e.stopPropagation();

        const collapsed = sidebar.classList.toggle('workspace-collapsed');
        hamburgerBtn.classList.toggle('active');
        
        // Save state
        localStorage.setItem('workspace-sidebar-collapsed', collapsed);
        console.log('Workspace sidebar collapsed:', collapsed);
    });
    
    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                if (!sidebar.classList.contains('workspace-collapsed')) {
                    sidebar.classList.add('workspace-collapsed');
                    hamburgerBtn.classList.add('active');
                    localStorage.setItem('workspace-sidebar-collapsed', 'true');
                }
            }
        }
    });
    
    console.log('Workspace sidebar toggle initialized successfully');
}

function createHamburgerButton() {
    const button = document.createElement('button');
    button.className = 'sidebar-toggle-btn';
    button.setAttribute('aria-label', 'Toggle Workspace Sidebar');
    button.setAttribute('type', 'button');
    button.innerHTML = `
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
    `;
    
    return button;
}
