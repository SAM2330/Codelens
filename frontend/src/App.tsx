import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { CodePage } from "./pages/CodePage";
import { ChatPage } from "./pages/ChatPage";
import { CodeFlowsPage } from "./pages/CodeFlowsPage";
import { APIsPage } from "./pages/APIsPage";
import { DatabasePage } from "./pages/DatabasePage";
import { SecurityPage } from "./pages/SecurityPage";

export const App: React.FC = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/repositories" replace />} />
                    <Route path="/repositories" element={<RepositoriesPage />} />
                    <Route path="/repositories/:id" element={<OverviewPage />} />
                    <Route path="/repositories/:id/chat" element={<ChatPage />} />
                    <Route path="/repositories/:id/architecture" element={<ArchitecturePage />} />
                    <Route path="/repositories/:id/code" element={<CodePage />} />
                    <Route path="/repositories/:id/flows" element={<CodeFlowsPage />} />
                    <Route path="/repositories/:id/apis" element={<APIsPage />} />
                    <Route path="/repositories/:id/database" element={<DatabasePage />} />
                    <Route path="/repositories/:id/security" element={<SecurityPage />} />
                    <Route path="*" element={<Navigate to="/repositories" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
};

export default App;
