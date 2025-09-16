frappe.ready(() => {
    // Fetch the list of workspaces for the current user
    frappe.call({
        method: 'frappe.core.doctype.workspace.workspace.get_workspaces_for_user',
        callback: (r) => {
            const workspaces = r.message || [];
            const sidebarList = document.querySelector('#workspace-sidebar .sidebar-list');
            if (!sidebarList) return;

            sidebarList.innerHTML = ''; // Clear any existing content

            // Create a list item for each workspace and append it to the sidebar
            workspaces.forEach(workspace => {
                const li = document.createElement('li');
                li.classList.add('sidebar-item');
                
                // Set the active class if the current page belongs to this workspace
                if (window.location.pathname.includes(frappe.router.slug(workspace.name))) {
                    li.classList.add('active');
                }

                const a = document.createElement('a');
                a.href = `/app/${frappe.router.slug(workspace.name)}`;
                a.textContent = workspace.label;

                li.appendChild(a);
                sidebarList.appendChild(li);
            });
        }
    });
});
