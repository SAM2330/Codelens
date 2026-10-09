import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
    fetchRepositoryById,
    fetchRepositoryFiles,
    fetchRepositoryFileContent
} from "../services/api";
import {
    StoredAnalysisResult,
    AnalyzedFileSummary,
    AnalyzedFileContent
} from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { FileTree } from "../components/FileTree";
import { SourceCodeViewer } from "../components/SourceCodeViewer";
import { FileCode, Code, AlertCircle, RefreshCw } from "lucide-react";

export const CodePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();

    const pathParam = searchParams.get("path");
    const lineParam = searchParams.get("line");
    const startLineParam = searchParams.get("startLine");
    const endLineParam = searchParams.get("endLine");

    const targetLine = lineParam ? parseInt(lineParam, 10) : undefined;
    const startLine = startLineParam ? parseInt(startLineParam, 10) : undefined;
    const endLine = endLineParam ? parseInt(endLineParam, 10) : undefined;

    const [analysis, setAnalysis] = useState<StoredAnalysisResult | null>(null);
    const [files, setFiles] = useState<AnalyzedFileSummary[]>([]);
    const [loadingRepo, setLoadingRepo] = useState(true);
    const [repoError, setRepoError] = useState<string | null>(null);

    const [activeFile, setActiveFile] = useState<AnalyzedFileContent | null>(null);
    const [loadingFile, setLoadingFile] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    // 1. Load repository analysis & files list
    const loadRepositoryData = useCallback(async () => {
        if (!id) return;
        setLoadingRepo(true);
        setRepoError(null);

        try {
            const [repoData, filesData] = await Promise.all([
                fetchRepositoryById(id),
                fetchRepositoryFiles(id)
            ]);

            setAnalysis(repoData);
            setFiles(filesData || []);

            // If no path in URL and files exist, auto-select first file or keep blank
            if (!pathParam && filesData && filesData.length > 0) {
                // Auto-select first non-config file or first file
                const firstCodeFile =
                    filesData.find(
                        (f) =>
                            f.path.endsWith(".ts") ||
                            f.path.endsWith(".tsx") ||
                            f.path.endsWith(".js") ||
                            f.path.endsWith(".jsx")
                    ) || filesData[0];

                if (firstCodeFile) {
                    setSearchParams({ path: firstCodeFile.path }, { replace: true });
                }
            }
        } catch (err: any) {
            setRepoError(err?.message || "Failed to load repository files");
        } finally {
            setLoadingRepo(false);
        }
    }, [id, pathParam, setSearchParams]);

    useEffect(() => {
        loadRepositoryData();
    }, [id]);

    // 2. Load file content when pathParam changes
    const loadFileContent = useCallback(
        async (filePath: string) => {
            if (!id) return;
            setLoadingFile(true);
            setFileError(null);

            try {
                const contentData = await fetchRepositoryFileContent(id, filePath);
                setActiveFile(contentData);
            } catch (err: any) {
                setFileError(err?.message || `Failed to load file: ${filePath}`);
                setActiveFile(null);
            } finally {
                setLoadingFile(false);
            }
        },
        [id]
    );

    useEffect(() => {
        if (pathParam) {
            loadFileContent(pathParam);
        } else {
            setActiveFile(null);
            setFileError(null);
        }
    }, [pathParam, loadFileContent]);

    // File selection handler
    const handleSelectFile = (selectedPath: string) => {
        if (selectedPath === pathParam) return;
        setSearchParams({ path: selectedPath });
    };

    // Line selection handler
    const handleSelectLine = (line: number) => {
        if (!pathParam) return;
        setSearchParams({
            path: pathParam,
            line: line.toString()
        });
    };

    // Clear line highlight
    const handleClearLineHighlight = () => {
        if (!pathParam) return;
        setSearchParams({ path: pathParam });
    };

    if (loadingRepo) {
        return <LoadingState message="Loading repository source files..." />;
    }

    if (repoError || !analysis) {
        return (
            <ErrorState
                title="Repository not found"
                message={repoError || "Could not load source files for this repository."}
                onRetry={loadRepositoryData}
            />
        );
    }

    const repoUrl =
        analysis.repository.html_url ||
        analysis.repository.github_url ||
        undefined;

    return (
        <div className="code-viewer-page">
            <div className="code-viewer-layout">
                {/* Left Sidebar: File Tree */}
                <aside className="code-viewer-sidebar">
                    {files.length === 0 ? (
                        <div className="code-viewer-empty-sidebar">
                            <AlertCircle size={20} className="text-amber-400" />
                            <p>No analyzed files found in this repository.</p>
                        </div>
                    ) : (
                        <FileTree
                            files={files}
                            activePath={pathParam || undefined}
                            onSelectFile={handleSelectFile}
                        />
                    )}
                </aside>

                {/* Right Main Content: Code Viewer */}
                <main className="code-viewer-main">
                    {loadingFile ? (
                        <div className="code-viewer-loading">
                            <LoadingState message={`Fetching source for ${pathParam}...`} />
                        </div>
                    ) : fileError ? (
                        <div className="code-viewer-file-error">
                            <ErrorState
                                title="File not found"
                                message={fileError}
                                onRetry={() => pathParam && loadFileContent(pathParam)}
                            />
                        </div>
                    ) : activeFile ? (
                        <SourceCodeViewer
                            file={activeFile}
                            targetLine={targetLine}
                            startLine={startLine}
                            endLine={endLine}
                            repositoryUrl={repoUrl}
                            onSelectLine={handleSelectLine}
                            onClearLineHighlight={handleClearLineHighlight}
                        />
                    ) : (
                        <div className="code-viewer-placeholder">
                            <EmptyState
                                title="Select a file to inspect"
                                description="Choose any file from the file tree on the left to view its analyzed syntax-highlighted source code."
                                icon={<Code size={36} className="text-blue-400" />}
                            />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
