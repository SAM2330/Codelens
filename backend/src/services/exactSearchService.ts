import { ExactSearchResult } from "../types/database";

export interface ExtractedSearchTerms {
    rawQuery: string;
    symbols: string[];
    filePaths: string[];
    isSymbolOriented: boolean;
    isFileOriented: boolean;
}

const COMMON_STOP_WORDS = new Set([
    "a", "about", "all", "also", "an", "and", "any", "are", "as", "at",
    "be", "been", "being", "but", "by", "can", "could", "did", "do",
    "does", "doing", "done", "each", "explain", "for", "from", "get",
    "give", "had", "has", "have", "having", "he", "her", "here", "hers",
    "him", "his", "how", "i", "if", "in", "into", "is", "it", "its",
    "just", "like", "me", "more", "most", "my", "no", "not", "of", "on",
    "one", "only", "or", "other", "our", "ours", "out", "over", "please",
    "see", "she", "should", "show", "so", "some", "such", "tell", "than",
    "that", "the", "their", "theirs", "them", "then", "there", "these",
    "they", "this", "those", "through", "to", "too", "under", "up",
    "use", "used", "uses", "using", "very", "was", "we", "were", "what",
    "when", "where", "which", "while", "who", "whom", "whose", "why",
    "will", "with", "would", "you", "your", "yours",
    // Query intent filler words
    "code", "definition", "defined", "declaration", "implementation",
    "implemented", "look", "meaning", "overview", "summary", "works",
    "working", "repo", "repository", "project"
]);

const FILE_EXTENSIONS = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "sql", "html",
    "css", "scss", "sass", "py", "go", "rs", "java", "c", "cpp", "h",
    "hpp", "cs", "rb", "php", "sh", "bash", "yaml", "yml", "toml", "env"
]);

/**
 * Extracts candidate symbols, file paths, and query orientation from a user question.
 */
export function extractExactSearchTerms(query: string): ExtractedSearchTerms {
    const rawQuery = (query || "").trim();
    if (!rawQuery) {
        return {
            rawQuery: "",
            symbols: [],
            filePaths: [],
            isSymbolOriented: false,
            isFileOriented: false
        };
    }

    const lowerQuery = rawQuery.toLowerCase();

    // 1. Detect query orientation
    const fileKeywords = /\b(file|filepath|path|folder|directory|in file|from file)\b/i;
    const hasPathIndicators = /[/\\]|\.(?:ts|tsx|js|jsx|json|md|sql|html|css|py|go)\b/i;
    const isFileOriented = fileKeywords.test(rawQuery) || hasPathIndicators.test(rawQuery);

    const symbolKeywords = /\b(function|method|class|interface|type|symbol|variable|const|enum|struct|handler|component|hook)\b/i;
    const hasCodeIdentifiers = /`[^`]+`|\b[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*\b|\b[A-Z][a-zA-Z0-9_$]{2,}\b/;
    const isSymbolOriented = symbolKeywords.test(rawQuery) || (hasCodeIdentifiers.test(rawQuery) && !isFileOriented);

    const foundSymbols: Set<string> = new Set();
    const foundFilePaths: Set<string> = new Set();

    // 2. Extract backtick-quoted literals: `symbol` or `path/to/file`
    const backtickRegex = /`([^`]+)`/g;
    let match: RegExpExecArray | null;
    while ((match = backtickRegex.exec(rawQuery)) !== null) {
        const val = match[1].trim();
        if (val.length >= 2) {
            if (val.includes("/") || val.includes("\\") || /\.[a-z0-9]+$/i.test(val)) {
                const norm = val.replace(/\\/g, "/");
                foundFilePaths.add(norm);
                const base = norm.split("/").pop();
                if (base && base.length >= 2) foundFilePaths.add(base);
            } else {
                foundSymbols.add(val);
            }
        }
    }

    // 3. Extract file paths and files with known extensions
    const pathRegex = /(?:^|[\s"'`(<[])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?:$|[\s"'`)>\]:?,])/g;
    while ((match = pathRegex.exec(rawQuery)) !== null) {
        const candidate = match[1].trim();
        const ext = candidate.split(".").pop()?.toLowerCase();
        if (ext && FILE_EXTENSIONS.has(ext)) {
            const normalized = candidate.replace(/\\/g, "/");
            foundFilePaths.add(normalized);
            const base = normalized.split("/").pop();
            if (base && base.length >= 2) {
                foundFilePaths.add(base);
            }
        }
    }

    // 4. Extract explicit symbol names after declaration keywords (e.g. "function calculateScore")
    const explicitSymbolRegex = /\b(?:function|method|class|interface|type|symbol|const|let|var|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$.]*)/gi;
    while ((match = explicitSymbolRegex.exec(rawQuery)) !== null) {
        const sym = match[1].trim();
        if (sym.length >= 2 && !COMMON_STOP_WORDS.has(sym.toLowerCase())) {
            foundSymbols.add(sym);
        }
    }

    // 5. Extract dotted symbols (e.g. MediaController.getTrending)
    const dottedRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    while ((match = dottedRegex.exec(rawQuery)) !== null) {
        const dotSym = match[1].trim();
        const ext = dotSym.split(".").pop()?.toLowerCase();
        if (!ext || !FILE_EXTENSIONS.has(ext)) {
            foundSymbols.add(dotSym);
            // Also add both class and method pieces
            const parts = dotSym.split(".");
            if (parts[0].length >= 2) foundSymbols.add(parts[0]);
            if (parts[1].length >= 2) foundSymbols.add(parts[1]);
        }
    }

    // 6. Extract camelCase, PascalCase, or snake_case code identifiers
    const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    while ((match = identifierRegex.exec(rawQuery)) !== null) {
        const word = match[1].trim();
        const lowerWord = word.toLowerCase();

        if (word.length >= 2 && !COMMON_STOP_WORDS.has(lowerWord)) {
            const isCamelOrPascal = /[a-z][A-Z]/.test(word) || /^[A-Z][a-zA-Z0-9]{2,}$/.test(word);
            const isSnake = word.includes("_") && word.length >= 4;

            if (isCamelOrPascal || isSnake) {
                foundSymbols.add(word);
            }
        }
    }

    // 7. If query is a single clean word or short path, treat it directly as candidate
    const cleanedSingle = rawQuery.replace(/^[#`"']+|[#`"':?,]+$/g, "");
    if (/^[a-zA-Z0-9_$./-]+$/.test(cleanedSingle) && cleanedSingle.length >= 2) {
        if (cleanedSingle.includes("/") || /\.[a-z0-9]+$/i.test(cleanedSingle)) {
            const norm = cleanedSingle.replace(/\\/g, "/");
            foundFilePaths.add(norm);
            const base = norm.split("/").pop();
            if (base) foundFilePaths.add(base);
        } else if (!COMMON_STOP_WORDS.has(cleanedSingle.toLowerCase())) {
            foundSymbols.add(cleanedSingle);
        }
    }

    return {
        rawQuery,
        symbols: Array.from(foundSymbols),
        filePaths: Array.from(foundFilePaths),
        isSymbolOriented,
        isFileOriented
    };
}

export interface RawChunkCandidate {
    id: string;
    repositoryId: string;
    analysisId?: string;
    filePath: string;
    language: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    content: string;
}

/**
 * Computes exact match score and match type for a retrieved chunk against query terms.
 */
export function scoreExactCandidate(
    chunk: RawChunkCandidate,
    terms: ExtractedSearchTerms
): { similarity: number; matchType: ExactSearchResult["matchType"] } | null {
    const chunkSymbol = (chunk.symbol || "").trim();
    const chunkSymbolLower = chunkSymbol.toLowerCase();
    const chunkFilePath = (chunk.filePath || "").replace(/\\/g, "/");
    const chunkFilePathLower = chunkFilePath.toLowerCase();
    const chunkFileName = chunkFilePath.split("/").pop() || chunkFilePath;
    const chunkFileNameLower = chunkFileName.toLowerCase();

    let bestScore = 0;
    let bestType: ExactSearchResult["matchType"] | null = null;

    // Check symbol matches
    for (const sym of terms.symbols) {
        const symLower = sym.toLowerCase();
        if (!symLower || symLower.length < 2) continue;

        // 1. Exact full symbol match (e.g. MediaController === MediaController)
        if (chunkSymbolLower === symLower) {
            const score = terms.isSymbolOriented ? 1.0 : 0.98;
            if (score > bestScore) {
                bestScore = score;
                bestType = "exact_symbol";
            }
        }
        // 2. Exact compound method match (e.g. symbol is Class.method, search is method or Class.method)
        else if (
            chunkSymbolLower.endsWith(`.${symLower}`) ||
            chunkSymbolLower.startsWith(`${symLower}.`)
        ) {
            const score = terms.isSymbolOriented ? 0.99 : 0.97;
            if (score > bestScore) {
                bestScore = score;
                bestType = "exact_symbol";
            }
        }
        // 3. Partial symbol substring match (if term is reasonably specific)
        else if (
            symLower.length >= 3 &&
            (chunkSymbolLower.includes(symLower) || symLower.includes(chunkSymbolLower))
        ) {
            const score = terms.isSymbolOriented ? 0.88 : 0.85;
            if (score > bestScore) {
                bestScore = score;
                bestType = "partial_symbol";
            }
        }
    }

    // Check file path matches
    for (const fp of terms.filePaths) {
        const fpLower = fp.toLowerCase();
        if (!fpLower || fpLower.length < 2) continue;

        // 1. Exact full file path or exact filename match
        if (
            chunkFilePathLower === fpLower ||
            chunkFilePathLower.endsWith(`/${fpLower}`) ||
            chunkFileNameLower === fpLower
        ) {
            let score = 0.97;
            if (terms.isFileOriented) {
                score = chunk.symbolType === "file" ? 1.0 : 0.98;
            } else if (chunk.symbolType === "file") {
                score = 0.98;
            }

            if (score > bestScore) {
                bestScore = score;
                bestType = "exact_file";
            }
        }
        // 2. Partial file path match (e.g. directory or stem without extension)
        else if (
            fpLower.length >= 4 &&
            (chunkFilePathLower.includes(fpLower) || chunkFileNameLower.includes(fpLower))
        ) {
            const score = terms.isFileOriented ? 0.86 : 0.82;
            if (score > bestScore) {
                bestScore = score;
                bestType = "partial_file";
            }
        }
    }

    if (bestScore <= 0 || !bestType) {
        return null;
    }

    return {
        similarity: bestScore,
        matchType: bestType
    };
}

/**
 * Scores and ranks raw candidate chunks using exact search terms.
 */
export function scoreAndRankExactCandidates(
    chunks: RawChunkCandidate[],
    terms: ExtractedSearchTerms,
    limit: number = 8
): ExactSearchResult[] {
    const scored: ExactSearchResult[] = [];

    for (const chunk of chunks) {
        const evaluated = scoreExactCandidate(chunk, terms);
        if (evaluated) {
            scored.push({
                ...chunk,
                similarity: evaluated.similarity,
                matchType: evaluated.matchType
            });
        }
    }

    // Rank scored candidates
    scored.sort((a, b) => {
        // 1. Higher score first
        if (b.similarity !== a.similarity) {
            return b.similarity - a.similarity;
        }

        // 2. If symbol-oriented, prioritize exact_symbol over exact_file
        if (terms.isSymbolOriented) {
            if (a.matchType === "exact_symbol" && b.matchType !== "exact_symbol") return -1;
            if (b.matchType === "exact_symbol" && a.matchType !== "exact_symbol") return 1;
        }

        // 3. If file-oriented, prioritize exact_file over exact_symbol
        if (terms.isFileOriented) {
            if (a.matchType === "exact_file" && b.matchType !== "exact_file") return -1;
            if (b.matchType === "exact_file" && a.matchType !== "exact_file") return 1;
        }

        // 4. Prioritize specific symbols (class, function, method) over whole-file chunks
        const isASpecific = a.symbolType !== "file";
        const isBSpecific = b.symbolType !== "file";
        if (isASpecific && !isBSpecific) return -1;
        if (!isASpecific && isBSpecific) return 1;

        // 5. Stable order by file_path and start_line
        if (a.filePath !== b.filePath) {
            return a.filePath.localeCompare(b.filePath);
        }
        return a.startLine - b.startLine;
    });

    return scored.slice(0, limit);
}
