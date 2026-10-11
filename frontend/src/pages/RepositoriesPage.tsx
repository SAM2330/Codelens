import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchUserRepositories } from "../services/api";
import { StoredRepository } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { AnalyzeModal } from "../components/AnalyzeModal";
import {
    FolderGit2,
    Search,
    Plus,
    ExternalLink,
    GitBranch,
    Calendar,
    ArrowRight,
    LogIn,
    Shield
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const RepositoriesPage: React.FC = () => {
    const { user, isLoading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [repositories, setRepositories] = useState<StoredRepository[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);

    const loadData = async () => {
        if (!user) {
            setRepositories([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await fetchUserRepositories();
            setRepositories(data || []);
        } catch (err: any) {
            setError(err?.message || "Failed to load your repositories");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            loadData();
        }
    }, [user, authLoading]);

    const filtered = repositories.filter((r) => {
        const query = search.toLowerCase();
        return (
            r.name.toLowerCase().includes(query) ||
            r.owner.toLowerCase().includes(query) ||
            (r.description && r.description.toLowerCase().includes(query))
        );
    });

    if (authLoading || loading) {
        return <LoadingState message="Loading your workspace..." />;
    }

    if (error) {
        return <ErrorState message={error} onRetry={loadData} />;
    }

    return (
        <div>
            <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 className="page-title">{user ? "My Repositories" : "Repositories"}</h1>
                    <p className="page-subtitle">
                        {user
                            ? "Repositories analyzed in your personal workspace"
                            : "Analyze GitHub repositories with deep architectural intelligence"}
                    </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {user && (
                        <div style={{ position: "relative" }}>
                            <Search
                                size={16}
                                style={{
                                    position: "absolute",
                                    left: "12px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "var(--text-dim)"
                                }}
                            />
                            <input
                                type="text"
                                placeholder="Filter repositories..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="input-text"
                                style={{
                                    margin: 0,
                                    paddingLeft: "36px",
                                    width: "240px"
                                }}
                            />
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={() => setIsAnalyzeOpen(true)}
                    >
                        <Plus size={16} />
                        <span>Analyze Repo</span>
                    </button>
                </div>
            </div>

            {!user ? (
                <EmptyState
                    title="Welcome to CodeLens"
                    description="You are currently browsing as a guest. Analyze any public GitHub repository to explore its architecture, or sign in to save repositories to your personal workspace."
                    action={
                        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => setIsAnalyzeOpen(true)}
                            >
                                <Plus size={16} />
                                <span>Analyze a Repository</span>
                            </button>
                            <Link to="/login" className="btn btn-secondary">
                                <LogIn size={16} />
                                <span>Sign In</span>
                            </Link>
                        </div>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    title={repositories.length === 0 ? "You haven't analyzed any repositories yet" : "No matching repositories"}
                    description={
                        repositories.length === 0
                            ? "Get started by analyzing your first GitHub repository to inspect its structure, APIs, and flows."
                            : "Try adjusting your search filter."
                    }
                    action={
                        repositories.length === 0 ? (
                            <button
                                className="btn btn-primary"
                                onClick={() => setIsAnalyzeOpen(true)}
                            >
                                <Plus size={16} />
                                <span>Analyze Your First Repository</span>
                            </button>
                        ) : undefined
                    }
                />
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem" }}>
                    {filtered.map((repo) => (
                        <div
                            key={repo.id}
                            className="metric-card"
                            style={{
                                flexDirection: "column",
                                alignItems: "stretch",
                                justifyContent: "space-between",
                                gap: "1.25rem",
                                minHeight: "200px"
                            }}
                        >
                            <div>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <div
                                            style={{
                                                width: "36px",
                                                height: "36px",
                                                borderRadius: "var(--radius-md)",
                                                backgroundColor: "var(--accent-blue-bg)",
                                                color: "var(--accent-blue)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}
                                        >
                                            <FolderGit2 size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)" }}>
                                                {repo.name}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                                                {typeof repo.owner === "string" ? repo.owner : (repo.owner as any)?.login || ""}
                                            </div>
                                        </div>
                                    </div>

                                    {repo.github_url && (
                                        <a
                                            href={repo.github_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: "var(--text-dim)" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                    )}
                                </div>

                                <p
                                    style={{
                                        fontSize: "0.85rem",
                                        color: "var(--text-muted)",
                                        lineHeight: 1.4,
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden"
                                    }}
                                >
                                    {repo.description || "No description provided."}
                                </p>
                            </div>

                            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                        <GitBranch size={14} />
                                        <span>{repo.default_branch || "main"}</span>
                                    </div>
                                    {repo.last_analyzed_at && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                            <Calendar size={14} />
                                            <span>{new Date(repo.last_analyzed_at).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>

                                <Link
                                    to={`/repositories/${repo.id}`}
                                    className="btn btn-secondary"
                                    style={{ width: "100%", justifyContent: "center" }}
                                >
                                    <span>Explore Analysis</span>
                                    <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AnalyzeModal
                isOpen={isAnalyzeOpen}
                onClose={() => setIsAnalyzeOpen(false)}
                onSuccess={(repoId) => {
                    loadData();
                    if (repoId) {
                        navigate(`/repositories/${repoId}`);
                    }
                }}
            />
        </div>
    );
};
