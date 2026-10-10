import React from "react";
import { Link } from "react-router-dom";
import { Citation } from "../types";
import { FileCode, ArrowUpRight } from "lucide-react";

interface CitationLinkProps {
    citation: Citation;
    repositoryId: string;
    showDetails?: boolean;
    className?: string;
}

export const CitationLink: React.FC<CitationLinkProps> = ({
    citation,
    repositoryId,
    showDetails = false,
    className = ""
}) => {
    const fileName = citation.filePath.split("/").pop() || citation.filePath;
    const isRange = citation.startLine && citation.endLine && citation.startLine !== citation.endLine;
    const lineLabel = isRange
        ? `lines ${citation.startLine}–${citation.endLine}`
        : `line ${citation.startLine || 1}`;

    const url = `/repositories/${encodeURIComponent(repositoryId)}/code?path=${encodeURIComponent(
        citation.filePath
    )}&startLine=${citation.startLine || 1}&endLine=${citation.endLine || citation.startLine || 1}`;

    if (!showDetails) {
        return (
            <Link
                to={url}
                className={`citation-badge ${className}`}
                title={`Jump to ${fileName} (${lineLabel}${citation.symbol ? ` - ${citation.symbol}` : ""})`}
            >
                <span>[{citation.id}]</span>
            </Link>
        );
    }

    return (
        <Link
            to={url}
            className={`citation-card-link ${className}`}
            title={`Open ${citation.filePath} at ${lineLabel}`}
        >
            <div className="citation-card-left">
                <span className="citation-card-id">[{citation.id}]</span>
                <FileCode size={14} className="text-blue-400" />
                <span className="citation-card-file">{fileName}</span>
                {citation.symbol && (
                    <span className="citation-card-symbol">
                        {citation.symbolType ? `${citation.symbolType} ` : ""}{citation.symbol}
                    </span>
                )}
                <span className="citation-card-lines">{lineLabel}</span>
            </div>
            <ArrowUpRight size={14} className="citation-card-arrow" />
        </Link>
    );
};
