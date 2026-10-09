import { analyzeImports, ImportInfo, analyzeCodeStructure } from "./codeAnalyzer";
import { analyzeAST, ASTAnalysis } from "./astAnalyzer";

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
    structure: ASTAnalysis;
};

export function analyzeFile(file: RepositoryFile): AnalyzedFile {
    const path = file.path.toLowerCase();
    const fileName = path.split("/").pop() || "";

    let language = "Unknown";
    let type = "Other";
    let area = "Other";

    // Language detection
    if (path.endsWith(".ts")) {
        language = "TypeScript";
    } else if (path.endsWith(".tsx")) {
        language = "TypeScript/React";
    } else if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
        language = "JavaScript";
    } else if (path.endsWith(".jsx")) {
        language = "JavaScript/React";
    } else if (path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".sass") || path.endsWith(".less")) {
        language = "CSS";
    } else if (path.endsWith(".html") || path.endsWith(".htm")) {
        language = "HTML";
    } else if (path.endsWith(".json") || path.endsWith(".jsonc") || path.endsWith(".json5")) {
        language = "JSON";
    } else if (path.endsWith(".md") || path.endsWith(".mdx")) {
        language = "Markdown";
    } else if (path.endsWith(".prisma")) {
        language = "Prisma";
    } else if (path.endsWith(".sql")) {
        language = "SQL";
    } else if (path.endsWith(".py") || path.endsWith(".pyw")) {
        language = "Python";
    } else if (path.endsWith(".go")) {
        language = "Go";
    } else if (path.endsWith(".rs")) {
        language = "Rust";
    } else if (path.endsWith(".java")) {
        language = "Java";
    } else if (path.endsWith(".kt") || path.endsWith(".kts")) {
        language = "Kotlin";
    } else if (path.endsWith(".c") || path.endsWith(".h")) {
        language = "C";
    } else if (path.endsWith(".cpp") || path.endsWith(".cc") || path.endsWith(".hpp")) {
        language = "C++";
    } else if (path.endsWith(".cs")) {
        language = "C#";
    } else if (path.endsWith(".php")) {
        language = "PHP";
    } else if (path.endsWith(".rb")) {
        language = "Ruby";
    } else if (path.endsWith(".sh") || path.endsWith(".bash") || path.endsWith(".zsh") || path.endsWith(".ps1")) {
        language = "Shell";
    } else if (path.endsWith(".yaml") || path.endsWith(".yml")) {
        language = "YAML";
    } else if (path.endsWith(".toml")) {
        language = "TOML";
    } else if (path.endsWith(".xml")) {
        language = "XML";
    } else if (path.endsWith(".vue")) {
        language = "Vue";
    } else if (path.endsWith(".svelte")) {
        language = "Svelte";
    } else if (path.endsWith(".astro")) {
        language = "Astro";
    } else if (path.endsWith(".graphql") || path.endsWith(".gql")) {
        language = "GraphQL";
    } else if (fileName === ".gitignore" || fileName === ".gitattributes" || fileName === ".editorconfig" || fileName === "dockerfile") {
        language = "Configuration";
    }

    // Type classification
    if (path.includes("/controllers/") || fileName.includes("controller")) {
        type = "Controller";
    } else if (path.includes("/services/") || fileName.includes("service")) {
        type = "Service";
    } else if (path.includes("/routes/") || path.includes("/api/") || fileName.includes("route")) {
        type = "Route";
    } else if (path.includes("/middlewares/") || fileName.includes("middleware")) {
        type = "Middleware";
    } else if (path.includes("/components/") || fileName.includes("component")) {
        type = "Component";
    } else if (path.includes("/hooks/") || fileName.includes("use")) {
        type = "Hook";
    } else if (path.includes("/utils/") || path.includes("/lib/") || path.includes("/helpers/")) {
        type = "Utility";
    } else if (path.includes("/models/") || path.includes("/entities/")) {
        type = "Model";
    } else if (path.endsWith("schema.prisma") || path.includes("/prisma/")) {
        type = "Database Schema";
    } else if (path.endsWith(".sql") || path.includes("/migrations/")) {
        type = "Database Migration";
    } else if (path.endsWith("package.json")) {
        type = "Package Configuration";
    } else if (fileName.includes("readme") || path.endsWith(".md") || path.endsWith(".mdx")) {
        type = "Documentation";
    } else if (path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".sass") || path.endsWith(".less")) {
        type = "Style";
    } else if (path.endsWith(".html") || path.endsWith(".htm")) {
        type = "HTML View";
    } else if (
        fileName.includes("config") ||
        path.endsWith(".yaml") ||
        path.endsWith(".yml") ||
        path.endsWith(".toml") ||
        fileName.startsWith(".env") ||
        fileName === ".gitignore" ||
        fileName === "dockerfile"
    ) {
        type = "Configuration";
    }

    // Area classification
    if (path.includes("/backend/") || path.includes("/server/") || path.includes("/api/")) {
        area = "Backend";
    } else if (path.includes("/frontend/") || path.includes("/client/") || path.includes("/web/") || path.includes("/app/") || path.includes("/pages/")) {
        area = "Frontend";
    } else if (path.includes("/shared/") || path.includes("/common/")) {
        area = "Shared";
    }

    return {
        ...file,
        language,
        type,
        area,
        imports: analyzeImports(file.content),
        structure: isCodeFile(file.path)
            ? analyzeAST(file.path, file.content)
            : {
                  functions: [],
                  classes: [],
                  interfaces: [],
                  types: [],
                  imports: [],
                  exports: []
              }
    };
}

const ignoredDirectories = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
    ".turbo",
    ".cache",
    "vendor",
    "target",
    "bin",
    "obj"
];

const ignoredExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".mp4",
    ".mp3",
    ".wav",
    ".ogg",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".otf",
    ".zip",
    ".tar",
    ".gz",
    ".pdf",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".class",
    ".pyc",
    ".wasm",
    ".map"
];

const ignoredLockfiles = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "composer.lock",
    "cargo.lock"
];

function isSensitiveFile(filePath: string): boolean {
    const fileName = filePath.split("/").pop()?.toLowerCase() || "";

    // Explicitly allow safe templates
    if (
        fileName === ".env.example" ||
        fileName === ".env.sample" ||
        fileName === ".env.template"
    ) {
        return false;
    }

    // Secret env files
    if (fileName === ".env" || fileName.startsWith(".env.")) {
        return true;
    }

    // Private keys and certificates
    if (
        fileName.endsWith(".pem") ||
        fileName.endsWith(".key") ||
        fileName.endsWith(".pfx") ||
        fileName.endsWith(".p12") ||
        fileName === "id_rsa" ||
        fileName === "id_dsa" ||
        fileName === "id_ecdsa" ||
        fileName === "id_ed25519"
    ) {
        return true;
    }

    // Service account credential files
    if (
        fileName === "credentials.json" ||
        fileName === "service-account.json" ||
        fileName.startsWith("service-account-")
    ) {
        return true;
    }

    return false;
}

export function isCodeFile(path: string): boolean {
    const codeExtensions = [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".mts",
        ".cts"
    ];

    return codeExtensions.some((extension) =>
        path.toLowerCase().endsWith(extension)
    );
}

export function shouldAnalyzeFile(path: string): boolean {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || "";

    // 1. Check ignored directories anywhere in path
    if (parts.some((part) => ignoredDirectories.includes(part))) {
        return false;
    }

    // 2. Check sensitive secret files
    if (isSensitiveFile(normalized)) {
        return false;
    }

    // 3. Check binary / media extensions
    if (ignoredExtensions.some((ext) => fileName.endsWith(ext))) {
        return false;
    }

    // 4. Check generated lockfiles
    if (ignoredLockfiles.includes(fileName)) {
        return false;
    }

    // 5. Whitelisted source code / markup / config / documentation extensions
    const supportedExtensions = [
        // TypeScript / JavaScript
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
        // Web / Styles / Markup
        ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".astro",
        // Database & Query
        ".prisma", ".sql", ".graphql", ".gql",
        // Python, Go, Rust, Java, C, C++, C#, etc.
        ".py", ".pyw", ".go", ".rs", ".java", ".kt", ".kts", ".c", ".cpp", ".cc", ".h", ".hpp", ".cs", ".php", ".rb", ".swift", ".dart", ".scala",
        // Shell
        ".sh", ".bash", ".zsh", ".ps1",
        // Config & Data
        ".json", ".jsonc", ".json5", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg", ".conf",
        // Documentation
        ".md", ".mdx", ".txt", ".rst"
    ];

    if (supportedExtensions.some((ext) => fileName.endsWith(ext))) {
        return true;
    }

    // 6. Well-known root / config filenames without standard extensions
    const wellKnownFiles = [
        ".gitignore",
        ".gitattributes",
        ".editorconfig",
        ".dockerignore",
        ".env.example",
        ".env.sample",
        ".env.template",
        "dockerfile",
        "makefile",
        "procfile",
        "cname",
        "license"
    ];

    if (wellKnownFiles.includes(fileName)) {
        return true;
    }

    return false;
}

