import React, { useState } from "react";
import { Code2, Plus, Terminal } from "lucide-react";
import { Link } from "react-router-dom";
import { AnalyzeModal } from "./AnalyzeModal";

export const Header: React.FC = () => {
    const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <Link to="/repositories" className="brand-logo">
                        <div className="brand-icon">
                            <Code2 size={18} />
                        </div>
                        <span>CodeLens</span>
                    </Link>
                    <div className="header-meta">
                        <Terminal size={14} />
                        <span>Repository Code Intelligence</span>
                    </div>
                </div>

                <div className="header-actions">
                    <button
                        className="btn btn-primary"
                        onClick={() => setIsAnalyzeOpen(true)}
                    >
                        <Plus size={16} />
                        <span>Analyze Repo</span>
                    </button>
                </div>
            </header>

            <AnalyzeModal
                isOpen={isAnalyzeOpen}
                onClose={() => setIsAnalyzeOpen(false)}
            />
        </>
    );
};
