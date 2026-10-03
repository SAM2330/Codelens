export type ImportInfo = {
    source: string;
    imports: string;
    category: "internal" | "external";
};

export function analyzeImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const importRegex =
        /import\s+(.*?)\s+from\s+["'](.+?)["']/g;

    let match;

    while ((match = importRegex.exec(content)) !== null) {
        imports.push({
            imports: match[1],
            source: match[2],
            category: classifyImport(match[2])
        });
    }

    return imports;
}
export function classifyImport(source: string): "internal" | "external" {
    if (
        source.startsWith("./") ||
        source.startsWith("../") ||
        source.startsWith("@/")
    ) {
        return "internal";
    }

    return "external";
}
export type CodeStructure = {
    functions: string[];
    classes: string[];
};
export function analyzeCodeStructure(
    content: string
): CodeStructure {
    const functions: string[] = [];
    const classes: string[] = [];

    const functionRegex =
        /(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)\s*(?:=\s*)?(?:async\s*)?\([^)]*\)\s*=>?/g;

    const classRegex =
        /class\s+([A-Za-z_$][\w$]*)/g;

    let match;

    while ((match = functionRegex.exec(content)) !== null) {
        functions.push(match[1]);
    }

    while ((match = classRegex.exec(content)) !== null) {
        classes.push(match[1]);
    }

    return {
        functions,
        classes
    };
}