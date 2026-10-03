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