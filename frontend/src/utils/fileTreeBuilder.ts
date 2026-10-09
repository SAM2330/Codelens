import { AnalyzedFileSummary, FileTreeNode } from "../types";

export function buildFileTree(files: AnalyzedFileSummary[]): FileTreeNode[] {
    const root: { [key: string]: any } = {};

    for (const file of files) {
        // Normalize path separators
        const normalized = file.path.replace(/\\/g, "/");
        const parts = normalized.split("/").filter(Boolean);

        let current = root;
        let currentPath = "";

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const isFile = i === parts.length - 1;

            if (!current[part]) {
                current[part] = {
                    name: part,
                    path: currentPath,
                    isDirectory: !isFile,
                    children: {},
                    file: isFile ? file : undefined
                };
            }

            if (!isFile) {
                current = current[part].children;
            }
        }
    }

    function convertNode(obj: { [key: string]: any }): FileTreeNode[] {
        const nodes: FileTreeNode[] = Object.values(obj).map((entry: any) => ({
            name: entry.name,
            path: entry.path,
            isDirectory: entry.isDirectory,
            children: convertNode(entry.children),
            file: entry.file
        }));

        // Sort directories first, then files alphabetically
        nodes.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });

        return nodes;
    }

    return convertNode(root);
}

export function getParentPaths(filePath: string): string[] {
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const parentPaths: string[] = [];

    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        parentPaths.push(current);
    }

    return parentPaths;
}

export function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
