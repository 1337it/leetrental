// Collapsible Sidebar for Frappe
// Add this file to your_app/public/js/sidebar_toggle.js


    initCollapsibleSidebar();


function initCollapsibleSidebar() {
    // Create hamburger button
    const hamburgerBtn = createHamburgerButton();
    
    // Insert hamburger button at the top of the page
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        navbar.insertAdjacentElement('afterbegin', hamburgerBtn);
    }
    
    // Get sidebar element
    const sidebar = document.querySelector('.layout-side-section');
    const mainSection = document.querySelector('.layout-main-section-wrapper');
    
    if (!sidebar || !mainSection) return;
    
    // Load saved state
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }
    
    // Toggle sidebar on button click
    hamburgerBtn.addEventListener('click', function() {
        const collapsed = sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
        hamburgerBtn.classList.toggle('active');
        
        // Save state
        localStorage.setItem('sidebar-collapsed', collapsed);
    });
    
    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                if (!sidebar.classList.contains('collapsed')) {
                    sidebar.classList.add('collapsed');
                    document.body.classList.add('sidebar-collapsed');
                    hamburgerBtn.classList.remove('active');
                    localStorage.setItem('sidebar-collapsed', 'true');
                }
            }
        }
    });
}

function createHamburgerButton() {
    const button = document.createElement('button');
    button.className = 'sidebar-toggle-btn';
    button.setAttribute('aria-label', 'Toggle Sidebar');
    button.innerHTML = `
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
    `;
    
    return button;
}
