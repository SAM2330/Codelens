import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
    MessageSquare,
    Send,
    Bot,
    User,
    Sparkles,
    RefreshCw,
    Trash2,
    AlertCircle,
    FileCode,
    Code2,
    HelpCircle,
    ArrowRight,
    Terminal
} from "lucide-react";
import { askRepositoryQuestion, fetchRepositoryById } from "../services/api";
import { ChatMessage, Citation, StoredAnalysisResult } from "../types";
import { CitationLink } from "../components/CitationLink";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";

const SUGGESTED_PROMPTS = [
    {
        title: "Latest Commit Changes",
        prompt: "What changed in the last commit?"
    },
    {
        title: "Compare Recent Commits",
        prompt: "What changed between the last two commits?"
    },
    {
        title: "Streaming System Commits",
        prompt: "Show commits that changed the streaming system."
    },
    {
        title: "Architecture Overview",
        prompt: "Explain the high-level project architecture, folder structure, and tech stack."
    },
    {
        title: "Authentication & Auth Flow",
        prompt: "How does authentication work in this codebase? Which middleware and tokens are used?"
    },
    {
        title: "Database Models & Schemas",
        prompt: "What database models and relations are defined in this project?"
    }
];

function loadStoredMessages(repoId?: string): ChatMessage[] {
    if (!repoId) return [];
    try {
        const key = `codelens_chat_${repoId}`;
        const saved = sessionStorage.getItem(key);
        if (!saved) return [];

        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((m: any) => m && typeof m === "object" && typeof m.content === "string")
                .map((m: any, idx: number) => ({
                    id: typeof m.id === "string" ? m.id : `restored_${idx}_${Date.now()}`,
                    role: m.role === "assistant" ? "assistant" : "user",
                    content: m.content,
                    citations: Array.isArray(m.citations) ? m.citations : [],
                    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                    error: Boolean(m.error),
                    errorMessage: typeof m.errorMessage === "string" ? m.errorMessage : undefined
                }));
        }
    } catch (e) {
        console.warn(`Failed to parse saved chat history for repo ${repoId}:`, e);
    }
    return [];
}

export const ChatPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [repository, setRepository] = useState<StoredAnalysisResult["repository"] | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages(id));
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const isSubmittingRef = useRef<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cancel in-flight request when component unmounts
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Sync messages state when repository ID changes in the URL
    useEffect(() => {
        setMessages(loadStoredMessages(id));
        setInput("");
        setError(null);
    }, [id]);

    // Load initial repository info
    useEffect(() => {
        if (!id) return;

        async function loadData() {
            setInitialLoading(true);
            setError(null);
            try {
                const repoData = await fetchRepositoryById(id!);
                if (repoData && repoData.repository) {
                    setRepository(repoData.repository);
                }
            } catch (err) {
                console.error("Failed to load repository details:", err);
                setError(err instanceof Error ? err.message : "Failed to load repository");
            } finally {
                setInitialLoading(false);
            }
        }

        loadData();
    }, [id]);

    // Persist chat history to sessionStorage whenever messages change
    useEffect(() => {
        if (!id) return;
        const storageKey = `codelens_chat_${id}`;
        if (messages.length > 0) {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(messages));
            } catch (err) {
                console.warn("Failed to persist messages to sessionStorage:", err);
            }
        } else {
            sessionStorage.removeItem(storageKey);
        }
    }, [messages, id]);

    // Scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
    }, [input]);

    const handleSend = async (queryText?: string) => {
        const query = (queryText !== undefined ? queryText : input).trim();
        if (!query || !id || isLoading || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setIsLoading(true);
        setError(null);

        const userMessageId = `user_${Date.now()}`;
        const assistantMessageId = `assistant_${Date.now()}`;

        const userMessage: ChatMessage = {
            id: userMessageId,
            role: "user",
            content: query,
            timestamp: new Date()
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await askRepositoryQuestion(id, query, controller.signal);

            const assistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: "assistant",
                content: response.answer,
                citations: response.citations || [],
                timestamp: new Date()
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err: any) {
            if (controller.signal.aborted) {
                console.log("Chat question was cancelled.");
                return;
            }

            console.error("Chat question failed:", err);
            const errorMessage = err instanceof Error ? err.message : "Failed to get AI answer";
            
            const errorAssistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: "assistant",
                content: "An error occurred while generating the answer.",
                timestamp: new Date(),
                error: true,
                errorMessage
            };

            setMessages((prev) => [...prev, errorAssistantMessage]);
        } finally {
            isSubmittingRef.current = false;
            setIsLoading(false);
            abortControllerRef.current = null;
            setTimeout(() => textareaRef.current?.focus(), 50);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleClearChat = () => {
        if (window.confirm("Are you sure you want to clear the chat history for this repository?")) {
            if (id) {
                sessionStorage.removeItem(`codelens_chat_${id}`);
            }
            setMessages([]);
        }
    };

    if (initialLoading) {
        return (
            <div className="page-container flex-center" style={{ minHeight: "60vh" }}>
                <LoadingState message="Connecting to CodeLens AI..." />
            </div>
        );
    }

    if (error && messages.length === 0) {
        return (
            <div className="page-container">
                <ErrorState message={error} />
            </div>
        );
    }

    return (
        <div className="page-container chat-page-container">
            {/* Chat Header */}
            <div className="chat-header">
                <div className="chat-header-info">
                    <div className="chat-header-title-row">
                        <div className="chat-header-icon-badge">
                            <Bot size={22} className="text-blue-400" />
                        </div>
                        <div>
                            <h1 className="chat-header-title">Repository AI Assistant</h1>
                            <p className="chat-header-subtitle">
                                Grounded code analysis with interactive citations for{" "}
                                <span className="font-semibold text-gray-200">
                                    {repository?.full_name || repository?.name || id}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="chat-header-actions">
                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="btn btn-secondary btn-sm flex-center gap-1"
                            title="Clear conversation history"
                        >
                            <Trash2 size={14} />
                            <span>Clear Chat</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Chat Messages List */}
            <div className="chat-messages-scroll-area">
                {messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <div className="chat-empty-icon-glow">
                            <Sparkles size={32} className="text-blue-400" />
                        </div>
                        <h2 className="chat-empty-title">Ask anything about this codebase</h2>
                        <p className="chat-empty-desc">
                            CodeLens uses semantic vector search, AST code analysis, and Git history intelligence
                            to provide precise answers grounded in code and commit history.
                        </p>

                        <div className="chat-suggested-section">
                            <div className="chat-suggested-label">Suggested Questions</div>
                            <div className="chat-suggested-grid">
                                {SUGGESTED_PROMPTS.map((item, index) => (
                                    <button
                                        key={index}
                                        className="chat-suggested-card"
                                        onClick={() => handleSend(item.prompt)}
                                        disabled={isLoading}
                                    >
                                        <div className="chat-suggested-card-header">
                                            <HelpCircle size={15} className="text-blue-400" />
                                            <span className="chat-suggested-card-title">{item.title}</span>
                                        </div>
                                        <div className="chat-suggested-card-prompt">{item.prompt}</div>
                                        <div className="chat-suggested-card-arrow">
                                            <ArrowRight size={14} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="chat-messages-list">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`chat-message-row ${
                                    message.role === "user" ? "user-row" : "assistant-row"
                                }`}
                            >
                                <div className="chat-avatar">
                                    {message.role === "user" ? (
                                        <User size={16} />
                                    ) : (
                                        <Bot size={16} className="text-blue-400" />
                                    )}
                                </div>

                                <div className="chat-message-bubble-wrapper">
                                    <div className="chat-message-header">
                                        <span className="chat-sender-name">
                                            {message.role === "user" ? "You" : "CodeLens AI"}
                                        </span>
                                        <span className="chat-timestamp">
                                            {message.timestamp.toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </span>
                                    </div>

                                    {message.error ? (
                                        <div className="chat-error-banner">
                                            <AlertCircle size={18} className="text-red-400 shrink-0" />
                                            <div className="chat-error-text">
                                                <div className="font-semibold text-red-300">
                                                    Failed to generate answer
                                                </div>
                                                <div className="text-sm text-red-200/80 mt-1">
                                                    {message.errorMessage || "An unexpected error occurred."}
                                                </div>
                                                {(message.errorMessage?.toLowerCase().includes("high demand") ||
                                                  message.errorMessage?.toLowerCase().includes("unavailable") ||
                                                  message.errorMessage?.includes("503")) ? (
                                                    <div className="text-xs text-amber-300/90 mt-2 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                                                        Note: The AI model is currently experiencing temporary high traffic. Please wait a moment and retry.
                                                    </div>
                                                ) : (message.errorMessage?.toLowerCase().includes("quota") ||
                                                     message.errorMessage?.toLowerCase().includes("rate limit") ||
                                                     message.errorMessage?.includes("429")) ? (
                                                    <div className="text-xs text-amber-300/90 mt-2 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                                                        Note: Gemini API free-tier rate limits reset every minute. Please wait a moment and try again.
                                                    </div>
                                                ) : ((message.errorMessage?.toLowerCase().includes("time") && message.errorMessage?.toLowerCase().includes("out")) ||
                                                     message.errorMessage?.includes("504")) ? (
                                                    <div className="text-xs text-amber-300/90 mt-2 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                                                        Note: The AI request timed out before completing. Please try asking again.
                                                    </div>
                                                ) : (message.errorMessage?.toLowerCase().includes("retrieval") ||
                                                     message.errorMessage?.toLowerCase().includes("retrieve")) ? (
                                                    <div className="text-xs text-amber-300/90 mt-2 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                                                        Note: Could not retrieve relevant context for this repository query.
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="chat-message-body">
                                            <RenderMessageContent
                                                content={message.content}
                                                citations={message.citations || []}
                                                repositoryId={id || ""}
                                            />

                                            {/* Detailed Citations Card List */}
                                            {message.citations && message.citations.length > 0 && (
                                                <div className="chat-citations-section">
                                                    <div className="chat-citations-heading">
                                                        <Code2 size={14} className="text-blue-400" />
                                                        <span>Cited Sources ({message.citations.length})</span>
                                                    </div>
                                                    <div className="chat-citations-grid">
                                                        {message.citations.map((citation) => (
                                                            <CitationLink
                                                                key={citation.id}
                                                                citation={citation}
                                                                repositoryId={id || ""}
                                                                showDetails={true}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* In-flight Loading Indicator */}
                        {isLoading && (
                            <div className="chat-message-row assistant-row">
                                <div className="chat-avatar">
                                    <Bot size={16} className="text-blue-400" />
                                </div>
                                <div className="chat-message-bubble-wrapper">
                                    <div className="chat-message-header">
                                        <span className="chat-sender-name">CodeLens AI</span>
                                        <span className="chat-timestamp">Thinking...</span>
                                    </div>
                                    <div className="chat-loading-indicator">
                                        <div className="typing-dots">
                                            <span></span>
                                            <span></span>
                                            <span></span>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            Searching code embeddings & generating grounded response...
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Chat Input Container */}
            <div className="chat-input-container">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="chat-input-form"
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question about this repository's code, architecture, or Git history... (Enter to send, Shift+Enter for new line)"
                        className="chat-textarea"
                        rows={1}
                        disabled={isLoading}
                    />

                    <button
                        type="submit"
                        disabled={isLoading || input.trim().length === 0}
                        className="chat-send-btn"
                        title="Send message (Enter)"
                    >
                        {isLoading ? (
                            <RefreshCw size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>

                <div className="chat-input-hint">
                    <span>💡 Grounded in repository code & Git commit history with verifiable file citations.</span>
                </div>
            </div>
        </div>
    );
};

// Helper component to render message text and replace inline citations [1], [2] with interactive badges
interface RenderMessageContentProps {
    content: string;
    citations: Citation[];
    repositoryId: string;
}

const RenderMessageContent: React.FC<RenderMessageContentProps> = ({
    content,
    citations,
    repositoryId
}) => {
    // Map of citation ID -> Citation object
    const citationMap = new Map<number, Citation>();
    citations.forEach((c) => citationMap.set(c.id, c));

    // Split content by citation markers e.g. [1], [2]
    const parts = content.split(/(\[\d+\])/g);

    return (
        <div className="chat-markdown-content">
            {parts.map((part, index) => {
                const match = part.match(/^\[(\d+)\]$/);
                if (match) {
                    const citationId = parseInt(match[1], 10);
                    const citation = citationMap.get(citationId);
                    if (citation) {
                        return (
                            <CitationLink
                                key={index}
                                citation={citation}
                                repositoryId={repositoryId}
                                showDetails={false}
                            />
                        );
                    }
                    // If no valid citation metadata was found for this ID, render as normal text
                    return <span key={index}>{part}</span>;
                }

                // Render paragraphs and code blocks cleanly
                return <span key={index} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
            })}
        </div>
    );
};
