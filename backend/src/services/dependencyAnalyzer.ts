import { AnalyzedFile } from "./repositoryAnalyzer";

export type Dependency = {
    from: string;
    to: string;
    source: string;
};

export function buildDependencyGraph(
    files: AnalyzedFile[]
): Dependency[] {
    const dependencies: Dependency[] = [];

    const filePaths = new Set(
        files.map((file) => file.path)
    );

    for (const file of files) {
        for (const imported of file.imports) {
            if (imported.category !== "internal") {
                continue;
            }

            const target = resolveImport(
                file.path,
                imported.source,
                filePaths
            );

            if (!target) {
                continue;
            }

            dependencies.push({
                from: file.path,
                to: target,
                source: imported.source
            });
        }
    }

    return dependencies;
}

function resolveImport(
    fromPath: string,
    importPath: string,
    filePaths: Set<string>
): string | null {
    const parts = fromPath.split("/");
    parts.pop();

    const targetParts = [
        ...parts,
        ...importPath.split("/")
    ];

    const normalized: string[] = [];

    for (const part of targetParts) {
        if (part === ".") {
            continue;
        }

        if (part === "..") {
            normalized.pop();
            continue;
        }

        normalized.push(part);
    }

    let basePath = normalized.join("/");

if (
    basePath.endsWith(".js") ||
    basePath.endsWith(".jsx") ||
    basePath.endsWith(".ts") ||
    basePath.endsWith(".tsx")
) {
    basePath = basePath.replace(/\.(js|jsx|ts|tsx)$/, "");
}

const possiblePaths = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`
];

    for (const path of possiblePaths) {
        if (filePaths.has(path)) {
            return path;
        }
    }

    return null;
}