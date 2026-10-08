import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
    repositoryName?: string;
    repositoryOwner?: string;
}

export const Layout: React.FC<LayoutProps> = ({
    repositoryName,
    repositoryOwner
}) => {
    return (
        <div className="app-container">
            <Sidebar
                repositoryName={repositoryName}
                repositoryOwner={repositoryOwner}
            />
            <div className="main-wrapper">
                <Header />
                <main className="content-container">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
