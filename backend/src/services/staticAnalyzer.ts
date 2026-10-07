import { AnalyzedFile } from "./repositoryAnalyzer";

export type StaticIssueSeverity =
    | "low"
    | "medium"
    | "high";

export type StaticIssue = {
    rule: string;
    severity: StaticIssueSeverity;
    message: string;
    file: string;
    line: number;
};

export type StaticAnalysis = {
    issues: StaticIssue[];
    summary: {
        total: number;
        low: number;
        medium: number;
        high: number;
    };
};

export function analyzeStaticCode(
    files: AnalyzedFile[]
): StaticAnalysis {
    const issues: StaticIssue[] = [];

    for (const file of files) {
    analyzeConsoleLogs(file, issues);
    analyzeAnyUsage(file, issues);
    analyzeEmptyCatch(file, issues);
    analyzeTodoComments(file, issues);
    analyzeTsIgnore(file, issues);
    analyzeLargeFunctions(file, issues);
    analyzeLargeFiles(file, issues);
}

    const summary = {
        total: issues.length,
        low: issues.filter(
            (issue) => issue.severity === "low"
        ).length,
        medium: issues.filter(
            (issue) => issue.severity === "medium"
        ).length,
        high: issues.filter(
            (issue) => issue.severity === "high"
        ).length
    };

    return {
        issues,
        summary
    };
}

function analyzeConsoleLogs(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (/\bconsole\.log\s*\(/.test(line)) {
            issues.push({
                rule: "no-console-log",
                severity: "low",
                message: "console.log statement found",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeAnyUsage(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    if (!file.path.match(/\.(ts|tsx)$/)) {
        return;
    }

    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /:\s*any\b/.test(line) ||
            /<any>/.test(line) ||
            /\bas\s+any\b/.test(line)
        ) {
            issues.push({
                rule: "no-explicit-any",
                severity: "medium",
                message: "Explicit any type found",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeEmptyCatch(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    const regex = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

    let match;

    while ((match = regex.exec(file.content)) !== null) {
        issues.push({
            rule: "empty-catch",
            severity: "medium",
            message: "Empty catch block found",
            file: file.path,
            line: getLineNumber(
                file.content,
                match.index
            )
        });
    }
}

function analyzeTodoComments(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (/\b(TODO|FIXME)\b/i.test(line)) {
            issues.push({
                rule: "todo-comment",
                severity: "low",
                message: "TODO or FIXME comment found",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeTsIgnore(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    if (!file.path.match(/\.(ts|tsx)$/)) {
        return;
    }

    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /@ts-ignore|@ts-nocheck/.test(line)
        ) {
            issues.push({
                rule: "typescript-ignore",
                severity: "medium",
                message:
                    "TypeScript checking is being explicitly bypassed",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeHardcodedUrls(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    const regex =
        /["'`](https?:\/\/[^"'`]+)["'`]/g;

    const ignoredDomains = [
        "localhost",
        "example.com",
        "cloud.umami.is",
        "googletagmanager.com",
        "youtube.com",
        "youtube-nocookie.com",
        "image.tmdb.org"
    ];

    let match;

    while ((match = regex.exec(file.content)) !== null) {
        const url = match[1];

        const isIgnored = ignoredDomains.some(
            (domain) => url.includes(domain)
        );

        if (isIgnored) {
            continue;
        }

        issues.push({
            rule: "hardcoded-url",
            severity: "low",
            message: "Hardcoded external URL found",
            file: file.path,
            line: getLineNumber(
                file.content,
                match.index
            )
        });
    }
}

function analyzeLargeFunctions(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    for (const fn of file.structure.functions) {
        const length =
            fn.endLine - fn.startLine + 1;

        if (length > 100) {
            issues.push({
                rule: "large-function",
                severity: "medium",
                message:
                    `Function ${fn.name} is ${length} lines long`,
                file: file.path,
                line: fn.startLine
            });
        }
    }
}

function analyzeLargeFiles(
    file: AnalyzedFile,
    issues: StaticIssue[]
) {
    const lines = file.content.split("\n").length;

    if (lines > 500) {
        issues.push({
            rule: "large-file",
            severity: "medium",
            message:
                `File contains ${lines} lines of code`,
            file: file.path,
            line: 1
        });
    }
}

function getLineNumber(
    content: string,
    position: number
): number {
    return content
        .slice(0, position)
        .split("\n")
        .length;
}