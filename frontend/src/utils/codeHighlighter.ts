import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";

export function detectPrismLanguage(filePath: string, languageHint?: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const hint = (languageHint || "").toLowerCase();

    if (ext === "ts") return "typescript";
    if (ext === "tsx") return "tsx";
    if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
    if (ext === "jsx") return "jsx";
    if (ext === "json") return "json";
    if (ext === "css") return "css";
    if (ext === "py") return "python";
    if (ext === "sql") return "sql";
    if (ext === "md") return "markdown";
    if (ext === "sh" || ext === "bash") return "bash";
    if (ext === "yml" || ext === "yaml") return "yaml";
    if (ext === "prisma") return "typescript"; // fallback for prisma schema syntax

    if (hint.includes("typescript") || hint.includes("react")) return "typescript";
    if (hint.includes("javascript")) return "javascript";
    if (hint.includes("python")) return "python";
    if (hint.includes("json")) return "json";
    if (hint.includes("css")) return "css";
    if (hint.includes("markdown")) return "markdown";

    return "javascript";
}

export function highlightCode(code: string, language: string): string {
    const prismLang = Prism.languages[language] || Prism.languages.javascript || Prism.languages.clike;
    if (!prismLang) {
        return escapeHtml(code);
    }
    try {
        return Prism.highlight(code, prismLang, language);
    } catch {
        return escapeHtml(code);
    }
}

export function highlightLines(code: string, language: string): string[] {
    const lines = code.split(/\r?\n/);
    return lines.map((line) => {
        if (!line) return "&nbsp;";
        return highlightCode(line, language);
    });
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
