import { AnalyzedFile } from "./repositoryAnalyzer";

export type SecurityIssueSeverity =
    | "low"
    | "medium"
    | "high";

export type SecurityIssue = {
    rule: string;
    severity: SecurityIssueSeverity;
    message: string;
    file: string;
    line: number;
};

export type SecurityAnalysis = {
    issues: SecurityIssue[];
    summary: {
        total: number;
        low: number;
        medium: number;
        high: number;
    };
};

export function analyzeSecurity(
    files: AnalyzedFile[]
): SecurityAnalysis {
    const issues: SecurityIssue[] = [];

    for (const file of files) {
        analyzeHardcodedSecrets(file, issues);
        analyzeEval(file, issues);
        analyzeUnsafeHTML(file, issues);
        analyzeCommandInjection(file, issues);
        analyzeSQLInjection(file, issues);
        analyzeHardcodedJWTSecrets(file, issues);
        analyzePermissiveCors(file, issues);
        analyzeInsecureHttp(file, issues);
        analyzeWeakHashing(file, issues);
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

function analyzeHardcodedSecrets(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    const secretPattern =
        /\b(api[_-]?key|secret|token|password|access[_-]?key)\b\s*[:=]\s*["'`](?!["'`])([^"'`]{8,})["'`]/i;

    lines.forEach((line, index) => {
        const match = line.match(secretPattern);

        if (!match) return;

        const value = match[2];

        if (
            value.includes("process.env") ||
            value.includes("YOUR_") ||
            value.includes("your_") ||
            value.includes("example") ||
            value.includes("placeholder")
        ) {
            return;
        }

        issues.push({
            rule: "hardcoded-secret",
            severity: "high",
            message:
                "Possible hardcoded secret, token, password, or API key found",
            file: file.path,
            line: index + 1
        });
    });
}

function analyzeEval(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /\beval\s*\(/.test(line) ||
            /\bnew\s+Function\s*\(/.test(line)
        ) {
            issues.push({
                rule: "unsafe-eval",
                severity: "high",
                message:
                    "Dynamic code execution using eval or Function constructor found",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeUnsafeHTML(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        // Direct DOM HTML assignment is higher risk
        if (/\.innerHTML\s*=/.test(line)) {
            issues.push({
                rule: "unsafe-html",
                severity: "high",
                message:
                    "Direct innerHTML assignment can allow HTML injection",
                file: file.path,
                line: index + 1
            });

            return;
        }

        // React/Next.js dangerouslySetInnerHTML should be reviewed,
        // but is not automatically a confirmed vulnerability.
        if (/dangerouslySetInnerHTML/.test(line)) {
            issues.push({
                rule: "dangerous-html-review",
                severity: "medium",
                message:
                    "dangerouslySetInnerHTML usage should be reviewed for untrusted HTML",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeCommandInjection(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /\b(exec|execSync)\s*\(/.test(line) &&
            (/`/.test(line) || /\$\{/.test(line) || /\+/.test(line))
        ) {
            issues.push({
                rule: "command-injection",
                severity: "high",
                message:
                    "Shell command appears to be constructed using dynamic input",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeSQLInjection(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        const containsSQL =
            /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(line);

        const containsDynamicInput =
            /\$\{/.test(line) ||
            /\+\s*[a-zA-Z_$][\w$]*/.test(line);

        if (containsSQL && containsDynamicInput) {
            issues.push({
                rule: "possible-sql-injection",
                severity: "high",
                message:
                    "SQL query appears to be constructed using dynamic input",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeHardcodedJWTSecrets(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /\b(jwt\.sign|jwt\.verify)\s*\(/.test(line) &&
            /["'`][^"'`]{6,}["'`]/.test(line)
        ) {
            issues.push({
                rule: "hardcoded-jwt-secret",
                severity: "high",
                message:
                    "JWT operation appears to use a hardcoded secret",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzePermissiveCors(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /cors\s*\(/.test(line) &&
            /origin\s*:\s*["'`]?\*["'`]?/.test(line)
        ) {
            issues.push({
                rule: "permissive-cors",
                severity: "medium",
                message:
                    "CORS allows requests from any origin",
                file: file.path,
                line: index + 1
            });
        }
    });
}

function analyzeInsecureHttp(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const regex =
        /["'`](http:\/\/(?!localhost|127\.0\.0\.1)[^"'`]+)["'`]/g;

    let match;

    while ((match = regex.exec(file.content)) !== null) {
        issues.push({
            rule: "insecure-http",
            severity: "medium",
            message:
                "External resource uses unencrypted HTTP instead of HTTPS",
            file: file.path,
            line: getLineNumber(
                file.content,
                match.index
            )
        });
    }
}

function analyzeWeakHashing(
    file: AnalyzedFile,
    issues: SecurityIssue[]
) {
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
        if (
            /createHash\s*\(\s*["'`](md5|sha1)["'`]\s*\)/i.test(
                line
            )
        ) {
            issues.push({
                rule: "weak-hash",
                severity: "medium",
                message:
                    "Weak hashing algorithm detected: MD5 or SHA-1",
                file: file.path,
                line: index + 1
            });
        }
    });
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