import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppBar } from "./AppBar";
import { Sidebar } from "./Sidebar";
import { getPageTitle } from "../../utils/routeTitles";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <AppBar
        pageTitle={pageTitle}
        onMenuClick={() => setSidebarOpen(true)}
      />
      <div className="flex flex-1">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
