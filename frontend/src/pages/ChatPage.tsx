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
    },
    {
        title: "API Endpoints & Routing",
        prompt: "What API endpoints are available and how are requests routed and handled?"
    },
    {
        title: "Error Handling & Middlewares",
        prompt: "How are errors handled throughout the services and controllers?"
    }
];

export const ChatPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [repository, setRepository] = useState<StoredAnalysisResult["repository"] | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const storageKey = `codelens_chat_${id}`;

    // Load initial repository info & session chat history
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

                // Restore session history from sessionStorage
                const saved = sessionStorage.getItem(storageKey);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        const restored = parsed.map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        }));
                        setMessages(restored);
                    } catch (e) {
                        console.warn("Failed to parse saved chat history:", e);
                    }
                }
            } catch (err) {
                console.error("Failed to load repository details:", err);
                setError(err instanceof Error ? err.message : "Failed to load repository");
            } finally {
                setInitialLoading(false);
            }
        }

        loadData();
    }, [id, storageKey]);

    // Save chat history to sessionStorage on update
    useEffect(() => {
        if (messages.length > 0) {
            sessionStorage.setItem(storageKey, JSON.stringify(messages));
        } else {
            sessionStorage.removeItem(storageKey);
        }
    }, [messages, storageKey]);

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
        if (!query || !id || isLoading) return;

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
        setIsLoading(true);
        setError(null);

        try {
            const response = await askRepositoryQuestion(id, query);

            const assistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: "assistant",
                content: response.answer,
                citations: response.citations || [],
                timestamp: new Date()
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err: any) {
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
            setIsLoading(false);
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
            setMessages([]);
            sessionStorage.removeItem(storageKey);
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
                            CodeLens uses semantic vector search and AST code analysis to provide
                            precise answers with direct source-code citations.
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
                        placeholder="Ask a question about this repository's code, architecture, or APIs... (Enter to send, Shift+Enter for new line)"
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
                    <span>💡 Grounded in repository code with verifiable file and line citations.</span>
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
