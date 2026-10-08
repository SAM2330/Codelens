import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    FolderGit2,
    Layers,
    GitFork,
    Network,
    Database,
    ShieldAlert,
    BookOpen
} from "lucide-react";

interface SidebarProps {
    repositoryName?: string;
    repositoryOwner?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    repositoryName,
    repositoryOwner
}) => {
    const location = useLocation();

    // Extract repository ID from path if present (e.g. /repositories/123/...)
    const repoMatch = location.pathname.match(/^\/repositories\/([^/]+)/);
    const activeRepoId = repoMatch ? repoMatch[1] : null;

    return (
        <aside className="app-sidebar">
            <div className="sidebar-section">
                <div className="sidebar-heading">Navigation</div>
                <nav className="sidebar-nav">
                    <NavLink
                        to="/repositories"
                        end
                        className={({ isActive }) =>
                            `sidebar-link ${isActive ? "active" : ""}`
                        }
                    >
                        <LayoutDashboard size={18} />
                        <span>Dashboard</span>
                    </NavLink>
                    <NavLink
                        to="/repositories"
                        className={({ isActive }) =>
                            `sidebar-link ${isActive && !activeRepoId ? "active" : ""}`
                        }
                    >
                        <FolderGit2 size={18} />
                        <span>Repositories</span>
                    </NavLink>
                </nav>
            </div>

            {activeRepoId && (
                <div className="sidebar-section" style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "0.5rem" }}>
                    {(repositoryName || repositoryOwner) && (
                        <div className="sidebar-repo-header">
                            <div className="sidebar-repo-name">
                                {repositoryName || "Repository"}
                            </div>
                            {repositoryOwner && (
                                <div className="sidebar-repo-owner">
                                    {repositoryOwner}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="sidebar-heading">Current Repository</div>
                    <nav className="sidebar-nav">
                        <NavLink
                            to={`/repositories/${activeRepoId}`}
                            end
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <BookOpen size={18} />
                            <span>Overview</span>
                        </NavLink>

                        <NavLink
                            to={`/repositories/${activeRepoId}/architecture`}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <Layers size={18} />
                            <span>Architecture</span>
                        </NavLink>

                        <NavLink
                            to={`/repositories/${activeRepoId}/flows`}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <GitFork size={18} />
                            <span>Code Flows</span>
                        </NavLink>

                        <NavLink
                            to={`/repositories/${activeRepoId}/apis`}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <Network size={18} />
                            <span>APIs</span>
                        </NavLink>

                        <NavLink
                            to={`/repositories/${activeRepoId}/database`}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <Database size={18} />
                            <span>Database</span>
                        </NavLink>

                        <NavLink
                            to={`/repositories/${activeRepoId}/security`}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? "active" : ""}`
                            }
                        >
                            <ShieldAlert size={18} />
                            <span>Security</span>
                        </NavLink>
                    </nav>
                </div>
            )}
        </aside>
    );
};
