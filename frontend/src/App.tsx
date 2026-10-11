import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
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
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Navigate to="/repositories" replace />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/auth/callback" element={<AuthCallbackPage />} />
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
        </AuthProvider>
    );
};

export default App;
