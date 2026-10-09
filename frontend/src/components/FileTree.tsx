import React, { useState, useEffect, useMemo } from "react";
import { AnalyzedFileSummary, FileTreeNode } from "../types";
import { buildFileTree, getParentPaths, formatFileSize } from "../utils/fileTreeBuilder";
import {
    Folder,
    FolderOpen,
    FileCode,
    FileText,
    FileJson,
    Search,
    ChevronRight,
    ChevronDown,
    FolderTree,
    X
} from "lucide-react";

interface FileTreeProps {
    files: AnalyzedFileSummary[];
    activePath?: string;
    onSelectFile: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
    files,
    activePath,
    onSelectFile
}) => {
    const [filterQuery, setFilterQuery] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    const fileTree = useMemo(() => buildFileTree(files), [files]);

    // Automatically expand parent directories of active file
    useEffect(() => {
        if (activePath) {
            const parents = getParentPaths(activePath);
            if (parents.length > 0) {
                setExpandedFolders((prev) => {
                    const next = new Set(prev);
                    parents.forEach((p) => next.add(p));
                    return next;
                });
            }
        }
    }, [activePath]);

    const toggleFolder = (path: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const expandAll = () => {
        const allPaths = new Set<string>();
        function collect(nodes: FileTreeNode[]) {
            for (const node of nodes) {
                if (node.isDirectory) {
                    allPaths.add(node.path);
                    collect(node.children);
                }
            }
        }
        collect(fileTree);
        setExpandedFolders(allPaths);
    };

    const collapseAll = () => {
        setExpandedFolders(new Set());
    };

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split(".").pop()?.toLowerCase();
        if (ext === "ts" || ext === "tsx") {
            return <FileCode size={15} style={{ color: "#38bdf8", flexShrink: 0 }} />;
        }
        if (ext === "js" || ext === "jsx" || ext === "mjs") {
            return <FileCode size={15} style={{ color: "#fbbf24", flexShrink: 0 }} />;
        }
        if (ext === "json") {
            return <FileJson size={15} style={{ color: "#f59e0b", flexShrink: 0 }} />;
        }
        if (ext === "css" || ext === "scss") {
            return <FileCode size={15} style={{ color: "#06b6d4", flexShrink: 0 }} />;
        }
        if (ext === "md") {
            return <FileText size={15} style={{ color: "#a855f7", flexShrink: 0 }} />;
        }
        return <FileCode size={15} style={{ color: "#94a3b8", flexShrink: 0 }} />;
    };

    // Filter file tree if search query is entered
    const filteredTree = useMemo(() => {
        if (!filterQuery.trim()) return fileTree;

        const query = filterQuery.toLowerCase();

        function filterNodes(nodes: FileTreeNode[]): FileTreeNode[] {
            const results: FileTreeNode[] = [];

            for (const node of nodes) {
                if (node.isDirectory) {
                    const matchingChildren = filterNodes(node.children);
                    if (matchingChildren.length > 0 || node.name.toLowerCase().includes(query)) {
                        results.push({
                            ...node,
                            children: matchingChildren
                        });
                    }
                } else if (
                    node.name.toLowerCase().includes(query) ||
                    node.path.toLowerCase().includes(query)
                ) {
                    results.push(node);
                }
            }

            return results;
        }

        return filterNodes(fileTree);
    }, [fileTree, filterQuery]);

    // Auto-expand all matching folders when searching
    useEffect(() => {
        if (filterQuery.trim()) {
            const allPaths = new Set<string>();
            function collect(nodes: FileTreeNode[]) {
                for (const node of nodes) {
                    if (node.isDirectory) {
                        allPaths.add(node.path);
                        collect(node.children);
                    }
                }
            }
            collect(filteredTree);
            setExpandedFolders(allPaths);
        }
    }, [filterQuery, filteredTree]);

    const countFiles = (node: FileTreeNode): number => {
        if (!node.isDirectory) return 1;
        return node.children.reduce((acc, c) => acc + countFiles(c), 0);
    };

    const renderNode = (node: FileTreeNode, depth: number = 0) => {
        const isExpanded = expandedFolders.has(node.path);
        const isActive = !node.isDirectory && activePath === node.path;
        const indent = depth * 14;

        if (node.isDirectory) {
            const childFileCount = countFiles(node);
            return (
                <div key={node.path} className="file-tree-dir-group">
                    <div
                        className="file-tree-node file-tree-dir"
                        style={{ paddingLeft: `${indent + 8}px` }}
                        onClick={() => toggleFolder(node.path)}
                    >
                        <span className="file-tree-arrow">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="file-tree-dir-icon">
                            {isExpanded ? (
                                <FolderOpen size={16} style={{ color: "#60a5fa" }} />
                            ) : (
                                <Folder size={16} style={{ color: "#3b82f6" }} />
                            )}
                        </span>
                        <span className="file-tree-name">{node.name}</span>
                        <span className="file-tree-badge">{childFileCount}</span>
                    </div>

                    {isExpanded && (
                        <div className="file-tree-children">
                            {node.children.map((child) => renderNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div
                key={node.path}
                className={`file-tree-node file-tree-file ${isActive ? "active" : ""}`}
                style={{ paddingLeft: `${indent + 24}px` }}
                onClick={() => onSelectFile(node.path)}
                title={node.path}
            >
                <span className="file-tree-file-icon">{getFileIcon(node.name)}</span>
                <span className="file-tree-name">{node.name}</span>
                {node.file?.size ? (
                    <span className="file-tree-size">{formatFileSize(node.file.size)}</span>
                ) : null}
            </div>
        );
    };

    return (
        <div className="file-tree-container">
            {/* Header & Controls */}
            <div className="file-tree-header">
                <div className="file-tree-title">
                    <FolderTree size={16} className="text-blue-400" />
                    <span>Files</span>
                    <span className="badge badge-gray">{files.length}</span>
                </div>
                <div className="file-tree-actions">
                    <button
                        type="button"
                        className="file-tree-action-btn"
                        onClick={expandAll}
                        title="Expand all folders"
                    >
                        Expand
                    </button>
                    <button
                        type="button"
                        className="file-tree-action-btn"
                        onClick={collapseAll}
                        title="Collapse all folders"
                    >
                        Collapse
                    </button>
                </div>
            </div>

            {/* Filter Input */}
            <div className="file-tree-search-wrapper">
                <Search size={14} className="file-tree-search-icon" />
                <input
                    type="text"
                    placeholder="Filter files (e.g. service.ts)..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="file-tree-search-input"
                />
                {filterQuery && (
                    <button
                        type="button"
                        onClick={() => setFilterQuery("")}
                        className="file-tree-search-clear"
                        title="Clear filter"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Tree Items List */}
            <div className="file-tree-list">
                {filteredTree.length === 0 ? (
                    <div className="file-tree-empty">
                        <span>No files matching "{filterQuery}"</span>
                    </div>
                ) : (
                    filteredTree.map((node) => renderNode(node, 0))
                )}
            </div>
        </div>
    );
};
