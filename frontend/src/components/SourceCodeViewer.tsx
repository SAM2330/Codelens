import React, { useEffect, useRef, useState, useMemo } from "react";
import { AnalyzedFileContent } from "../types";
import { detectPrismLanguage, highlightLines } from "../utils/codeHighlighter";
import { formatFileSize } from "../utils/fileTreeBuilder";
import {
    Copy,
    Check,
    Link as LinkIcon,
    FileCode,
    Terminal,
    Maximize2,
    Minimize2,
    Eye,
    X,
    ExternalLink
} from "lucide-react";

interface SourceCodeViewerProps {
    file: AnalyzedFileContent;
    targetLine?: number;
    startLine?: number;
    endLine?: number;
    repositoryUrl?: string;
    onSelectLine?: (line: number) => void;
    onClearLineHighlight?: () => void;
}

export const SourceCodeViewer: React.FC<SourceCodeViewerProps> = ({
    file,
    targetLine,
    startLine,
    endLine,
    repositoryUrl,
    onSelectLine,
    onClearLineHighlight
}) => {
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [wrapLines, setWrapLines] = useState(false);
    const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

    const language = useMemo(
        () => detectPrismLanguage(file.path, file.language),
        [file.path, file.language]
    );

    const highlightedLines = useMemo(
        () => highlightLines(file.content, language),
        [file.content, language]
    );

    const totalLines = highlightedLines.length;

    // Determine target range
    const effectiveStartLine = targetLine
        ? targetLine
        : typeof startLine === "number" && startLine > 0
        ? startLine
        : undefined;

    const effectiveEndLine = targetLine
        ? targetLine
        : typeof endLine === "number" && endLine > 0
        ? endLine
        : effectiveStartLine;

    // Scroll to target line on load or change
    useEffect(() => {
        const scrollTo = effectiveStartLine || targetLine;
        if (scrollTo && lineRefs.current[scrollTo]) {
            const timeout = setTimeout(() => {
                lineRefs.current[scrollTo]?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [file.path, effectiveStartLine, targetLine]);

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(file.content);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        } catch (err) {
            console.error("Failed to copy code:", err);
        }
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
        } catch (err) {
            console.error("Failed to copy link:", err);
        }
    };

    // Breadcrumb parts
    const pathParts = file.path.replace(/\\/g, "/").split("/");
    const fileName = pathParts.pop() || file.path;

    // GitHub permalink URL if repositoryUrl is provided
    const githubFileUrl = repositoryUrl
        ? `${repositoryUrl.replace(/\/$/, "")}/blob/HEAD/${file.path}${
              effectiveStartLine
                  ? effectiveEndLine && effectiveEndLine !== effectiveStartLine
                      ? `#L${effectiveStartLine}-L${effectiveEndLine}`
                      : `#L${effectiveStartLine}`
                  : ""
          }`
        : null;

    const hasHighlight = typeof effectiveStartLine === "number";

    return (
        <div className="source-viewer-container">
            {/* Top Toolbar / Header */}
            <div className="source-viewer-header">
                <div className="source-viewer-header-left">
                    <FileCode size={18} className="text-blue-400" />
                    <div className="source-viewer-breadcrumbs">
                        {pathParts.map((part, i) => (
                            <React.Fragment key={i}>
                                <span className="source-breadcrumb-dir">{part}</span>
                                <span className="source-breadcrumb-sep">/</span>
                            </React.Fragment>
                        ))}
                        <span className="source-breadcrumb-file">{fileName}</span>
                    </div>

                    <div className="source-viewer-badges">
                        <span className="badge badge-blue">{file.language || language}</span>
                        <span className="badge badge-gray">{formatFileSize(file.size || file.content.length)}</span>
                        <span className="badge badge-gray">{totalLines} lines</span>
                    </div>
                </div>

                <div className="source-viewer-header-right">
                    {hasHighlight && (
                        <div className="source-highlight-badge">
                            <Eye size={13} className="text-amber-400" />
                            <span>
                                {effectiveStartLine === effectiveEndLine
                                    ? `Line ${effectiveStartLine}`
                                    : `Lines ${effectiveStartLine}–${effectiveEndLine}`}
                            </span>
                            {onClearLineHighlight && (
                                <button
                                    type="button"
                                    onClick={onClearLineHighlight}
                                    className="source-highlight-clear"
                                    title="Clear line highlight"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setWrapLines(!wrapLines)}
                        className={`source-viewer-btn ${wrapLines ? "active" : ""}`}
                        title={wrapLines ? "Disable wrap" : "Wrap long lines"}
                    >
                        {wrapLines ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        <span>{wrapLines ? "Unwrap" : "Wrap"}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyLink}
                        className="source-viewer-btn"
                        title="Copy link to this file / line range"
                    >
                        {copiedLink ? <Check size={14} className="text-emerald-400" /> : <LinkIcon size={14} />}
                        <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyCode}
                        className="source-viewer-btn"
                        title="Copy full file source code"
                    >
                        {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                    </button>

                    {githubFileUrl && (
                        <a
                            href={githubFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-viewer-btn"
                            title="View on GitHub"
                        >
                            <ExternalLink size={14} />
                            <span>GitHub</span>
                        </a>
                    )}
                </div>
            </div>

            {/* Code Body */}
            <div className={`source-viewer-body ${wrapLines ? "wrap-lines" : ""}`}>
                <pre className="source-code-pre">
                    <code className={`language-${language}`}>
                        {highlightedLines.map((lineHtml, index) => {
                            const lineNumber = index + 1;
                            const isSingleTarget =
                                effectiveStartLine === effectiveEndLine &&
                                lineNumber === effectiveStartLine;

                            const isRangeTarget =
                                effectiveStartLine !== undefined &&
                                effectiveEndLine !== undefined &&
                                effectiveStartLine !== effectiveEndLine &&
                                lineNumber >= effectiveStartLine &&
                                lineNumber <= effectiveEndLine;

                            const isHighlighted = isSingleTarget || isRangeTarget;
                            const isRangeStart = isRangeTarget && lineNumber === effectiveStartLine;
                            const isRangeEnd = isRangeTarget && lineNumber === effectiveEndLine;

                            return (
                                <div
                                    key={lineNumber}
                                    ref={(el) => {
                                        lineRefs.current[lineNumber] = el;
                                    }}
                                    className={`code-line ${
                                        isSingleTarget ? "target-line-single" : ""
                                    } ${isRangeTarget ? "target-line-range" : ""} ${
                                        isRangeStart ? "range-start" : ""
                                    } ${isRangeEnd ? "range-end" : ""}`}
                                    id={`L${lineNumber}`}
                                >
                                    <div
                                        className="code-line-number"
                                        onClick={() => onSelectLine?.(lineNumber)}
                                        title={`Click to focus line ${lineNumber}`}
                                    >
                                        {lineNumber}
                                    </div>
                                    <div
                                        className="code-line-content"
                                        dangerouslySetInnerHTML={{ __html: lineHtml }}
                                    />
                                </div>
                            );
                        })}
                    </code>
                </pre>
            </div>
        </div>
    );
};
