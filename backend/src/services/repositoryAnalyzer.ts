import { analyzeImports, ImportInfo , CodeStructure ,analyzeCodeStructure} from "./codeAnalyzer";
import { analyzeAST } from "./astAnalyzer";
export type RepositoryFile = {
    path: string;
    size: number;
    content: string;
};

export type AnalyzedFile = RepositoryFile & {
    language: string;
    type: string;
    area: string;
    imports: ImportInfo[];
    structure: CodeStructure;
};
export function analyzeFile(file: RepositoryFile): AnalyzedFile {
    const path = file.path.toLowerCase();

    let language = "Unknown";
    let type = "Other";
    let area = "Other";

    if (path.endsWith(".ts")) {
        language = "TypeScript";
    } else if (path.endsWith(".tsx")) {
        language = "TypeScript/React";
    } else if (path.endsWith(".js")) {
        language = "JavaScript";
    } else if (path.endsWith(".jsx")) {
        language = "JavaScript/React";
    } else if (path.endsWith(".css")) {
        language = "CSS";
    } else if (path.endsWith(".json")) {
        language = "JSON";
    } else if (path.endsWith(".md")) {
        language = "Markdown";
    } else if (path.endsWith(".prisma")) {
        language = "Prisma";
    }

    if (path.includes("/controllers/")) {
        type = "Controller";
    } else if (path.includes("/services/")) {
        type = "Service";
    } else if (path.includes("/routes/")) {
        type = "Route";
    } else if (path.includes("/middlewares/")) {
        type = "Middleware";
    } else if (path.includes("/components/")) {
        type = "Component";
    } else if (path.includes("/hooks/")) {
        type = "Hook";
    } else if (path.includes("/utils/")) {
        type = "Utility";
    } else if (path.includes("schema.prisma")) {
        type = "Database Schema";
    } else if (path.includes("package.json")) {
        type = "Package Configuration";
    } else if (path.includes("readme")) {
        type = "Documentation";
    }

    if (path.includes("/backend/")) {
        area = "Backend";
    } else if (path.includes("/frontend/")) {
        area = "Frontend";
    }

    return {
    ...file,
    language,
    type,
    area,
    imports: analyzeImports(file.content),
    structure: analyzeAST(file.path,file.content)

};
}
const ignoredDirectories = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out"
];

const ignoredExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".mp4",
    ".mp3",
    ".woff",
    ".woff2",
    ".ttf"
];
function isCodeFile(path: string): boolean {
    const codeExtensions = [
        ".ts",
        ".tsx",
        ".js",
        ".jsx"
    ];

    return codeExtensions.some((extension) =>
        path.toLowerCase().endsWith(extension)
    );
}

export function shouldAnalyzeFile(path: string): boolean {
    const normalizedPath = path.toLowerCase();

    if (
        ignoredDirectories.some((directory) =>
            normalizedPath.includes(`/${directory}/`)
        )
    ) {
        return false;
    }

    if (
        ignoredExtensions.some((extension) =>
            normalizedPath.endsWith(extension)
        )
    ) {
        return false;
    }

    if (!isCodeFile(path)) {
        return false;
    }

    return true;
}
