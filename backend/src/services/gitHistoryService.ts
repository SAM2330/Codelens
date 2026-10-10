import { GitAnalysis, GitCommit, GitFileChange } from "./gitAnalyzer";
import { RagSource } from "../types/database";

export type GitHistoryIntent =
    | "LATEST_COMMIT"
    | "COMPARE_COMMITS"
    | "FILE_HISTORY"
    | "TOPIC_COMMITS"
    | "TIME_RANGE"
    | "FUNCTION_INTRODUCED"
    | "GENERAL_HISTORY";

export interface GitQueryDetection {
    isGitHistory: boolean;
    intent?: GitHistoryIntent;
    targetFile?: string;
    topic?: string;
    days?: number;
    symbol?: string;
    needsCodeContext: boolean;
}

/**
 * Detects if a user query requires Git history retrieval, and extracts query parameters.
 */
export function detectGitHistoryIntent(query: string): GitQueryDetection {
    const q = query.trim().toLowerCase();

    // 1. Compare latest commits
    if (
        /\b(between(\s+the)?\s+last\s+(two|2)\s+commits|compare(\s+the)?\s+last\s+(two|2)\s+commits|diff(\s+between)?\s+(the\s+)?last\s+(two|2)\s+commits)\b/i.test(
            q
        ) ||
        /\b(last\s+(two|2)\s+commits|diff\s+last\s+2\s+commits)\b/i.test(q)
    ) {
        return {
            isGitHistory: true,
            intent: "COMPARE_COMMITS",
            needsCodeContext: false
        };
    }

    // 2. Latest/last commit
    if (
        /\b(what\s+changed\s+in\s+(the\s+)?(last|latest|most\s+recent)\s+commit)\b/i.test(
            q
        ) ||
        /\b(last|latest|most\s+recent)\s+commit\b/i.test(q) ||
        /\bwhat\s+(was|were)\s+the\s+(last|latest)\s+changes?\b/i.test(q)
    ) {
        return {
            isGitHistory: true,
            intent: "LATEST_COMMIT",
            needsCodeContext: false
        };
    }

    // 3. Time range changes (e.g. "last week", "past 7 days", "last month")
    const weekMatch = q.match(/\b(last|past)\s+(week|month|\d+\s+days?)\b/i);
    if (weekMatch) {
        let days = 7;
        const matchText = weekMatch[2].toLowerCase();
        if (matchText.includes("month")) {
            days = 30;
        } else if (matchText.includes("day")) {
            const num = parseInt(matchText, 10);
            if (!isNaN(num)) days = num;
        }
        return {
            isGitHistory: true,
            intent: "TIME_RANGE",
            days,
            needsCodeContext: false
        };
    }

    // 4. File history: "Who modified this file, and when?" or "Who touched <file>?"
    if (
        /\bwho\s+(modified|changed|edited|authored|touched|committed)\b/i.test(q) ||
        /\b(history\s+of|commits\s+for|changes\s+to)\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\b/i.test(
            q
        )
    ) {
        // Try to extract file name or path
        const fileMatch = q.match(
            /([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|json|md|py|go|html|css|sql|yaml|yml|sh))/i
        );
        const targetFile = fileMatch ? fileMatch[1] : undefined;

        return {
            isGitHistory: true,
            intent: "FILE_HISTORY",
            targetFile,
            needsCodeContext: true // Code context helps provide current file content
        };
    }

    // 5. Function/symbol introduction: "When was this function introduced?"
    if (
        /\bwhen\s+was\s+(this\s+|the\s+)?(function|method|class|symbol|feature)\s+introduced\b/i.test(
            q
        ) ||
        /\bwhen\s+was\s+([a-zA-Z0-9_]+)\s+introduced\b/i.test(q) ||
        /\bwho\s+(added|created|wrote)\s+(the\s+)?(function|method)\s+([a-zA-Z0-9_]+)\b/i.test(
            q
        )
    ) {
        const symbolMatch = q.match(
            /\b(?:function|method|class|symbol)\s+([a-zA-Z0-9_]+)\b/i
        ) || q.match(/\bwhen\s+was\s+([a-zA-Z0-9_]+)\s+introduced\b/i);

        return {
            isGitHistory: true,
            intent: "FUNCTION_INTRODUCED",
            symbol: symbolMatch ? symbolMatch[1] : undefined,
            needsCodeContext: true
        };
    }

    // 6. Topic commits: "Show commits that changed the streaming system"
    const topicMatch = q.match(
        /\b(?:show|list|find|get|view)?\s*commits\s+(?:that\s+changed|related\s+to|affecting|touching|for)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)(?:\s+system|\s+feature|\s+module|\s+pipeline|\?|$)/i
    );
    if (topicMatch) {
        const topic = topicMatch[1].trim();
        return {
            isGitHistory: true,
            intent: "TOPIC_COMMITS",
            topic,
            needsCodeContext: true
        };
    }

    // 7. General commits/history queries
    if (
        /\b(git\s+history|commit\s+history|recent\s+commits|show\s+commits|list\s+commits)\b/i.test(
            q
        )
    ) {
        return {
            isGitHistory: true,
            intent: "GENERAL_HISTORY",
            needsCodeContext: false
        };
    }

    return {
        isGitHistory: false,
        needsCodeContext: true
    };
}

export interface GitRetrievalResult {
    gitContext: string;
    sources: RagSource[];
    hasHistory: boolean;
    message?: string;
}

/**
 * Builds formatted historical evidence and citation sources from stored GitAnalysis.
 */
export function retrieveGitHistoryContext(
    git: GitAnalysis | null | undefined,
    detection: GitQueryDetection,
    availableFiles: { path: string }[] = []
): GitRetrievalResult {
    if (!git || !git.commits || git.commits.length === 0) {
        return {
            gitContext:
                "NOTE: No Git history data is available for this repository. The repository history is empty or was not collected.",
            sources: [],
            hasHistory: false,
            message:
                "The repository's available Git history is empty or not collected. No commit records or diffs are available."
        };
    }

    const { intent, targetFile, topic, days, symbol } = detection;
    const commits = git.commits;
    const recentChanges = git.recentChanges || [];

    switch (intent) {
        case "LATEST_COMMIT":
            return buildLatestCommitContext(commits, recentChanges);

        case "COMPARE_COMMITS":
            return buildCompareCommitsContext(commits, recentChanges, 2);

        case "FILE_HISTORY":
            return buildFileHistoryContext(commits, recentChanges, targetFile);

        case "TOPIC_COMMITS":
            return buildTopicCommitsContext(commits, recentChanges, topic || "");

        case "TIME_RANGE":
            return buildTimeRangeContext(commits, recentChanges, days || 7);

        case "FUNCTION_INTRODUCED":
            return buildFunctionIntroducedContext(
                commits,
                recentChanges,
                symbol,
                availableFiles
            );

        case "GENERAL_HISTORY":
        default:
            return buildGeneralHistoryContext(git);
    }
}

function createSourceForFile(
    filePath: string,
    commitSha: string,
    additions: number,
    deletions: number,
    patch?: string,
    index: number = 1
): RagSource {
    const diffContent = patch
        ? `\nDiff patch:\n${patch}`
        : `\nChange stats: +${additions} additions, -${deletions} deletions`;

    return {
        chunkId: `git-${commitSha.slice(0, 7)}-${filePath}`,
        filePath,
        symbol: `commit:${commitSha.slice(0, 7)}`,
        symbolType: "git-commit-change",
        startLine: 1,
        endLine: Math.max(1, additions + deletions),
        language: filePath.split(".").pop() || "txt",
        similarity: 1.0,
        content: `File modified in commit ${commitSha.slice(0, 7)}: ${filePath}${diffContent}`
    };
}

function buildLatestCommitContext(
    commits: GitCommit[],
    changes: GitFileChange[]
): GitRetrievalResult {
    const latest = commits[0];
    const prev = commits.length > 1 ? commits[1] : null;

    const commitChanges = changes.filter((c) => c.commit === latest.sha);
    const parentSha =
        latest.parents && latest.parents.length > 0
            ? latest.parents.join(", ")
            : prev
            ? prev.sha
            : "Initial commit (no parent)";

    let totalAdditions = 0;
    let totalDeletions = 0;

    const filesList = commitChanges.map((c) => {
        totalAdditions += c.additions;
        totalDeletions += c.deletions;
        const diffExcerpt = c.patch ? `\n    Diff excerpt:\n    ${c.patch.replace(/\n/g, "\n    ")}` : "";
        return `  * ${c.file} (+${c.additions}, -${c.deletions})${diffExcerpt}`;
    });

    const context = `LATEST COMMIT DETAILS:
- Hash: ${latest.sha} (Short: ${latest.sha.slice(0, 7)})
- Date: ${latest.date || "Unknown date"}
- Author: ${latest.author || "Unknown author"}
- Message: ${latest.message}${latest.body ? `\n- Full Body:\n${latest.body}` : ""}
- Parent Commit: ${parentSha}
- Total Changed Files: ${commitChanges.length} (+${totalAdditions} lines added, -${totalDeletions} lines deleted)
- Modified Files:
${filesList.length > 0 ? filesList.join("\n") : "  (No file change records stored for this commit)"}`;

    const sources: RagSource[] = commitChanges.slice(0, 6).map((c, idx) =>
        createSourceForFile(c.file, latest.sha, c.additions, c.deletions, c.patch, idx + 1)
    );

    return {
        gitContext: context,
        sources,
        hasHistory: true
    };
}

function buildCompareCommitsContext(
    commits: GitCommit[],
    changes: GitFileChange[],
    count: number = 2
): GitRetrievalResult {
    if (commits.length < 2) {
        const singleResult = buildLatestCommitContext(commits, changes);
        return {
            ...singleResult,
            gitContext: `Only 1 commit is available in the repository history:\n\n${singleResult.gitContext}\n\nCannot compare with a previous commit because no earlier commit exists in the record.`
        };
    }

    const c1 = commits[0]; // latest
    const c2 = commits[1]; // second latest

    const c1Changes = changes.filter((c) => c.commit === c1.sha);
    const c2Changes = changes.filter((c) => c.commit === c2.sha);

    const c1Files = c1Changes.map((c) => `  * ${c.file} (+${c.additions}, -${c.deletions})`);
    const c2Files = c2Changes.map((c) => `  * ${c.file} (+${c.additions}, -${c.deletions})`);

    const context = `COMPARISON BETWEEN THE LAST TWO COMMITS:

1. LATEST COMMIT (Current Head):
- Hash: ${c1.sha} (${c1.sha.slice(0, 7)})
- Date: ${c1.date || "Unknown"}
- Author: ${c1.author || "Unknown"}
- Message: ${c1.message}
- Parent: ${c1.parents?.join(", ") || c2.sha}
- Changed Files (${c1Changes.length}):
${c1Files.length > 0 ? c1Files.join("\n") : "  (None recorded)"}

2. PRECEDING COMMIT:
- Hash: ${c2.sha} (${c2.sha.slice(0, 7)})
- Date: ${c2.date || "Unknown"}
- Author: ${c2.author || "Unknown"}
- Message: ${c2.message}
- Parent: ${c2.parents?.join(", ") || (commits[2] ? commits[2].sha : "None")}
- Changed Files (${c2Changes.length}):
${c2Files.length > 0 ? c2Files.join("\n") : "  (None recorded)"}

SUMMARY OF DIFFERENCES:
- The latest commit (${c1.sha.slice(0, 7)}) was committed on ${c1.date} by ${c1.author}.
- The preceding commit (${c2.sha.slice(0, 7)}) was committed on ${c2.date} by ${c2.author}.`;

    const sources: RagSource[] = [];
    c1Changes.slice(0, 4).forEach((c, idx) => {
        sources.push(createSourceForFile(c.file, c1.sha, c.additions, c.deletions, c.patch, idx + 1));
    });
    c2Changes.slice(0, 4).forEach((c, idx) => {
        sources.push(createSourceForFile(c.file, c2.sha, c.additions, c.deletions, c.patch, sources.length + 1));
    });

    return {
        gitContext: context,
        sources,
        hasHistory: true
    };
}

function buildFileHistoryContext(
    commits: GitCommit[],
    changes: GitFileChange[],
    targetFile?: string
): GitRetrievalResult {
    let matchedChanges = changes;
    let matchedFileName = targetFile || "";

    if (targetFile) {
        const normalizedTarget = targetFile.replace(/\\/g, "/").toLowerCase();
        matchedChanges = changes.filter((c) =>
            c.file.toLowerCase().includes(normalizedTarget)
        );
        if (matchedChanges.length > 0) {
            matchedFileName = matchedChanges[0].file;
        }
    }

    if (matchedChanges.length === 0) {
        return {
            gitContext: `No commit records were found in the available history for file '${targetFile || "specified file"}'.
Available recent files in history include:
${Array.from(new Set(changes.map((c) => c.file)))
    .slice(0, 10)
    .map((f) => `* ${f}`)
    .join("\n")}`,
            sources: [],
            hasHistory: true,
            message: `No commit history found matching '${targetFile}'.`
        };
    }

    const commitMap = new Map<string, GitCommit>();
    commits.forEach((c) => commitMap.set(c.sha, c));

    const records = matchedChanges.map((change) => {
        const commit = commitMap.get(change.commit);
        return {
            sha: change.commit,
            shortSha: change.commit.slice(0, 7),
            file: change.file,
            additions: change.additions,
            deletions: change.deletions,
            author: commit?.author || "Unknown",
            date: commit?.date || "Unknown date",
            message: commit?.message || "No commit message",
            patch: change.patch
        };
    });

    // Group by author
    const authors = Array.from(new Set(records.map((r) => r.author)));

    const context = `HISTORY FOR FILE '${matchedFileName}':
Total modifications recorded in available history: ${records.length}
Authors who modified this file: ${authors.join(", ")}

COMMITS TOUCHING THIS FILE (Newest to Oldest):
${records
    .map(
        (r) =>
            `- [commit: ${r.shortSha}] on ${r.date} by ${r.author}: "${r.message}" (+${r.additions}, -${r.deletions} lines)${
                r.patch ? `\n    Patch excerpt:\n    ${r.patch.slice(0, 300).replace(/\n/g, "\n    ")}` : ""
            }`
    )
    .join("\n")}`;

    const sources: RagSource[] = records.slice(0, 6).map((r, idx) =>
        createSourceForFile(r.file, r.sha, r.additions, r.deletions, r.patch, idx + 1)
    );

    return {
        gitContext: context,
        sources,
        hasHistory: true
    };
}

function buildTopicCommitsContext(
    commits: GitCommit[],
    changes: GitFileChange[],
    topic: string
): GitRetrievalResult {
    const term = topic.toLowerCase().trim();

    // Match either commit message or file path
    const matchingCommits = commits.filter((c) => {
        const msgMatch = c.message.toLowerCase().includes(term);
        const fileMatch = changes.some(
            (ch) => ch.commit === c.sha && ch.file.toLowerCase().includes(term)
        );
        return msgMatch || fileMatch;
    });

    if (matchingCommits.length === 0) {
        return {
            gitContext: `No commits in the available history directly match topic '${topic}'.
Total commits available in history: ${commits.length}.
Latest commit message: "${commits[0]?.message}" by ${commits[0]?.author}.`,
            sources: [],
            hasHistory: true
        };
    }

    const commitLines = matchingCommits.map((c) => {
        const files = changes.filter((ch) => ch.commit === c.sha);
        const fileNames = files.map((f) => `* ${f.file} (+${f.additions}, -${f.deletions})`);
        return `- [commit: ${c.sha.slice(0, 7)}] on ${c.date} by ${c.author}: "${c.message}"
  Files changed (${files.length}):
  ${fileNames.length > 0 ? fileNames.slice(0, 5).join("\n  ") : "  (None recorded)"}`;
    });

    const context = `COMMITS RELATED TO '${topic.toUpperCase()}':
Found ${matchingCommits.length} commit(s) in repository history:

${commitLines.join("\n\n")}`;

    const sources: RagSource[] = [];
    matchingCommits.forEach((c) => {
        const files = changes.filter((ch) => ch.commit === c.sha);
        files.slice(0, 3).forEach((f) => {
            sources.push(
                createSourceForFile(f.file, c.sha, f.additions, f.deletions, f.patch, sources.length + 1)
            );
        });
    });

    return {
        gitContext: context,
        sources: sources.slice(0, 6),
        hasHistory: true
    };
}

function buildTimeRangeContext(
    commits: GitCommit[],
    changes: GitFileChange[],
    days: number
): GitRetrievalResult {
    // If commits have dates, calculate relative to latest commit date
    const latestDate = commits[0]?.date ? new Date(commits[0].date) : new Date();
    const cutoffDate = new Date(latestDate.getTime() - days * 24 * 60 * 60 * 1000);

    const filteredCommits = commits.filter((c) => {
        if (!c.date) return false;
        const d = new Date(c.date);
        return d >= cutoffDate;
    });

    const activeCommits = filteredCommits.length > 0 ? filteredCommits : commits.slice(0, 5);
    const isUsingFallback = filteredCommits.length === 0;

    const commitLines = activeCommits.map((c) => {
        const files = changes.filter((ch) => ch.commit === c.sha);
        return `- [commit: ${c.sha.slice(0, 7)}] ${c.date || "Unknown date"} by ${c.author}: "${c.message}" (${files.length} files changed)`;
    });

    const context = `REPOSITORY CHANGES (Time Window: ~${days} days${
        isUsingFallback ? ` - showing ${activeCommits.length} most recent commits as no commits occurred within exact recent window` : ""
    }):
Total commits in window: ${activeCommits.length}
Time range: from ${activeCommits[activeCommits.length - 1]?.date || "earlier"} to ${activeCommits[0]?.date || "latest"}

COMMITS:
${commitLines.join("\n")}`;

    const sources: RagSource[] = [];
    activeCommits.slice(0, 4).forEach((c) => {
        const files = changes.filter((ch) => ch.commit === c.sha);
        files.slice(0, 2).forEach((f) => {
            sources.push(
                createSourceForFile(f.file, c.sha, f.additions, f.deletions, f.patch, sources.length + 1)
            );
        });
    });

    return {
        gitContext: context,
        sources: sources.slice(0, 6),
        hasHistory: true
    };
}

function buildFunctionIntroducedContext(
    commits: GitCommit[],
    changes: GitFileChange[],
    symbol?: string,
    availableFiles: { path: string }[] = []
): GitRetrievalResult {
    const symbolName = symbol || "the requested function";

    // Look for commits that mention the symbol in message or patch
    const matchingCommits = commits.filter((c) => {
        if (symbol && c.message.toLowerCase().includes(symbol.toLowerCase())) {
            return true;
        }
        const hasPatchMatch = changes.some(
            (ch) =>
                ch.commit === c.sha &&
                ch.patch &&
                symbol &&
                ch.patch.toLowerCase().includes(symbol.toLowerCase())
        );
        return hasPatchMatch;
    });

    if (matchingCommits.length > 0) {
        const earliest = matchingCommits[matchingCommits.length - 1];
        const files = changes.filter((ch) => ch.commit === earliest.sha);

        const context = `FUNCTION/SYMBOL INTRODUCTION FOR '${symbolName}':
Commit found referencing this symbol:
- Commit Hash: ${earliest.sha} (${earliest.sha.slice(0, 7)})
- Date: ${earliest.date || "Unknown"}
- Author: ${earliest.author || "Unknown"}
- Commit Message: "${earliest.message}"
- Modified Files: ${files.map((f) => f.file).join(", ")}`;

        const sources: RagSource[] = files.slice(0, 4).map((f, idx) =>
            createSourceForFile(f.file, earliest.sha, f.additions, f.deletions, f.patch, idx + 1)
        );

        return {
            gitContext: context,
            sources,
            hasHistory: true
        };
    }

    // If not found in messages/patches, report honestly
    const context = `FUNCTION/SYMBOL INTRODUCTION INVESTIGATION FOR '${symbolName}':
The symbol '${symbolName}' is not explicitly mentioned in any commit messages or patch diffs across the ${commits.length} commits stored in the repository's available Git history.
Available commits span from ${commits[commits.length - 1]?.date || "earlier"} to ${commits[0]?.date || "latest"}.
If this function exists in the current repository code, it was introduced either as part of a broader commit or prior to the available commit window.
Do not invent or assume which commit added it without direct evidence.`;

    return {
        gitContext: context,
        sources: [],
        hasHistory: true
    };
}

function buildGeneralHistoryContext(git: GitAnalysis): GitRetrievalResult {
    const commits = git.commits;
    const hotFiles = git.hotFiles || [];
    const contributors = git.contributors || [];

    const commitLines = commits.slice(0, 10).map((c) => {
        return `- [commit: ${c.sha.slice(0, 7)}] ${c.date || "Unknown date"} by ${c.author}: "${c.message}"`;
    });

    const hotFileLines = hotFiles.slice(0, 5).map((h) => `* ${h.file} (${h.commits} commits)`);
    const contributorLines = contributors.map((c) => `* ${c.login} (${c.contributions} contributions)`);

    const context = `REPOSITORY GIT HISTORY SUMMARY:
Total Commits Analyzed: ${commits.length}
Contributors (${contributors.length}):
${contributorLines.length > 0 ? contributorLines.join("\n") : "  None recorded"}

Frequently Modified (Hot) Files:
${hotFileLines.length > 0 ? hotFileLines.join("\n") : "  None recorded"}

Recent Commits (Newest to Oldest):
${commitLines.join("\n")}`;

    const sources: RagSource[] = [];
    if (git.recentChanges && git.recentChanges.length > 0) {
        git.recentChanges.slice(0, 5).forEach((c, idx) => {
            sources.push(createSourceForFile(c.file, c.commit, c.additions, c.deletions, c.patch, idx + 1));
        });
    }

    return {
        gitContext: context,
        sources,
        hasHistory: true
    };
}
