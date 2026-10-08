import { AnalyzedFile } from "./repositoryAnalyzer";
import { CodeChunk, CodeChunkSymbolType } from "../types/database";
import {
    computeContentHash,
    formatChunkForEmbedding
} from "./embeddingService";

function extractLines(lines: string[], start: number, end: number): string {
    const s = Math.max(1, start) - 1;
    const e = Math.min(lines.length, end);
    return lines.slice(s, e).join("\n");
}

export function chunkFile(file: AnalyzedFile): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const content = file.content || "";
    const lines = content.split(/\r?\n/);

    if (lines.length === 0 || content.trim().length === 0) {
        return chunks;
    }

    const structure = file.structure;
    const hasSymbols =
        structure &&
        (structure.functions.length > 0 ||
            structure.classes.length > 0 ||
            structure.interfaces.length > 0 ||
            structure.types.length > 0);

    // If no symbols were detected, create a file-level chunk for the whole file
    if (!hasSymbols) {
        const fileName = file.path.split("/").pop() || file.path;
        const formatted = formatChunkForEmbedding({
            filePath: file.path,
            symbol: fileName,
            symbolType: "file",
            content
        });
        chunks.push({
            filePath: file.path,
            language: file.language,
            symbol: fileName,
            symbolType: "file",
            startLine: 1,
            endLine: lines.length,
            content: content,
            contentHash: computeContentHash(formatted)
        });
        return chunks;
    }

    const classes = structure.classes || [];
    const functions = structure.functions || [];
    const interfaces = structure.interfaces || [];
    const types = structure.types || [];

    // Track symbol line ranges to determine header/prelude chunk
    const allSymbolStartLines: number[] = [];

    // 1. Class chunks
    for (const cls of classes) {
        if (cls.startLine <= cls.endLine && cls.startLine <= lines.length) {
            allSymbolStartLines.push(cls.startLine);
            const chunkContent = extractLines(lines, cls.startLine, cls.endLine);
            if (chunkContent.trim().length > 0) {
                chunks.push({
                    filePath: file.path,
                    language: file.language,
                    symbol: cls.name,
                    symbolType: "class",
                    startLine: cls.startLine,
                    endLine: cls.endLine,
                    content: chunkContent
                });
            }
        }
    }

    // 2. Function and Method chunks
    for (const fn of functions) {
        if (fn.startLine <= fn.endLine && fn.startLine <= lines.length) {
            allSymbolStartLines.push(fn.startLine);

            // Check if function is a method inside one of the classes
            const enclosingClass = classes.find(
                (cls) =>
                    fn.startLine >= cls.startLine && fn.endLine <= cls.endLine
            );

            let symbol = fn.name;
            let symbolType: CodeChunkSymbolType = "function";

            if (enclosingClass) {
                symbol = `${enclosingClass.name}.${fn.name}`;
                symbolType = "method";
            } else if (fn.type === "method") {
                symbolType = "method";
            }

            const chunkContent = extractLines(lines, fn.startLine, fn.endLine);
            if (chunkContent.trim().length > 0) {
                chunks.push({
                    filePath: file.path,
                    language: file.language,
                    symbol,
                    symbolType,
                    startLine: fn.startLine,
                    endLine: fn.endLine,
                    content: chunkContent
                });
            }
        }
    }

    // 3. Interface chunks
    for (const itf of interfaces) {
        if (itf.startLine <= itf.endLine && itf.startLine <= lines.length) {
            allSymbolStartLines.push(itf.startLine);
            const chunkContent = extractLines(lines, itf.startLine, itf.endLine);
            if (chunkContent.trim().length > 0) {
                chunks.push({
                    filePath: file.path,
                    language: file.language,
                    symbol: itf.name,
                    symbolType: "interface",
                    startLine: itf.startLine,
                    endLine: itf.endLine,
                    content: chunkContent
                });
            }
        }
    }

    // 4. Type chunks
    for (const t of types) {
        if (t.startLine <= t.endLine && t.startLine <= lines.length) {
            allSymbolStartLines.push(t.startLine);
            const chunkContent = extractLines(lines, t.startLine, t.endLine);
            if (chunkContent.trim().length > 0) {
                chunks.push({
                    filePath: file.path,
                    language: file.language,
                    symbol: t.name,
                    symbolType: "type",
                    startLine: t.startLine,
                    endLine: t.endLine,
                    content: chunkContent
                });
            }
        }
    }

    // 5. File header / module chunk (imports, configuration, top-level setup before symbols)
    if (allSymbolStartLines.length > 0) {
        const firstSymbolLine = Math.min(...allSymbolStartLines);
        if (firstSymbolLine > 1) {
            const headerContent = extractLines(lines, 1, firstSymbolLine - 1);
            if (headerContent.trim().length > 0) {
                const fileName = file.path.split("/").pop() || file.path;
                chunks.unshift({
                    filePath: file.path,
                    language: file.language,
                    symbol: `${fileName}:header`,
                    symbolType: "file",
                    startLine: 1,
                    endLine: firstSymbolLine - 1,
                    content: headerContent
                });
            }
        }
    }

    // Deduplicate any exact match chunks and calculate contentHash
    const seen = new Set<string>();
    const uniqueChunks: CodeChunk[] = [];

    for (const chunk of chunks) {
        const key = `${chunk.filePath}:${chunk.symbol}:${chunk.symbolType}:${chunk.startLine}:${chunk.endLine}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueChunks.push({
                ...chunk,
                contentHash: computeContentHash(
                    formatChunkForEmbedding({
                        filePath: chunk.filePath,
                        symbol: chunk.symbol,
                        symbolType: chunk.symbolType,
                        content: chunk.content
                    })
                )
            });
        }
    }

    return uniqueChunks;
}

export function generateCodeChunks(files: AnalyzedFile[]): CodeChunk[] {
    const allChunks: CodeChunk[] = [];

    for (const file of files) {
        const fileChunks = chunkFile(file);
        allChunks.push(...fileChunks);
    }

    return allChunks;
}
