import { AnalyzedFile } from "./repositoryAnalyzer";

export type APIEndpoint = {
    method: string;
    path: string;
    file: string;
    line: number;
    framework: string;
};

export type APIAnalysis = {
    endpoints: APIEndpoint[];
    externalAPIs: string[];
};

export function analyzeAPIs(
    files: AnalyzedFile[]
): APIAnalysis {
    const endpoints: APIEndpoint[] = [];
    const externalAPIs = new Set<string>();

    for (const file of files) {
        const content = file.content;

        // Express routes
        const expressRegex =
            /\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/g;

        let match;

        while ((match = expressRegex.exec(content)) !== null) {
            endpoints.push({
                method: match[1].toUpperCase(),
                path: match[2],
                file: file.path,
                line: getLineNumber(content, match.index),
                framework: "Express"
            });
        }

        // fetch("https://...")
        const fetchRegex =
            /fetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/g;

        while ((match = fetchRegex.exec(content)) !== null) {
            externalAPIs.add(match[1]);
        }

        // axios.get("https://...")
        const axiosRegex =
            /axios\.(get|post|put|patch|delete)\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/g;

        while ((match = axiosRegex.exec(content)) !== null) {
            externalAPIs.add(match[2]);
        }
    }

    return {
        endpoints,
        externalAPIs: [...externalAPIs]
    };
}

function getLineNumber(
    content: string,
    position: number
): number {
    return content.slice(0, position).split("\n").length;
}