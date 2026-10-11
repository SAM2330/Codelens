import {
    StoredRepository,
    StoredAnalysisResult,
    CodeFlowsResponse,
    CodeFlowGraph,
    AnalyzedFileSummary,
    AnalyzedFileContent,
    AskRepositoryResponse,
    PersistedChatMessage
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
    currentAuthToken = token;
}

export function getAuthToken(): string | null {
    return currentAuthToken;
}

function getAuthHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...additionalHeaders };
    if (currentAuthToken) {
        headers["Authorization"] = `Bearer ${currentAuthToken}`;
    }
    return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
            const data = await response.json();
            if (data && (data.message || data.error)) {
                errorMessage = data.message || data.error;
            }
        } catch {
            // fallback to default status text
        }
        throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
}

export async function fetchRepositories(): Promise<StoredRepository[]> {
    const res = await fetch(`${API_BASE_URL}/repositories`, {
        headers: getAuthHeaders()
    });
    return handleResponse<StoredRepository[]>(res);
}

export async function fetchRepositoryById(
    id: string
): Promise<StoredAnalysisResult> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}`,
        { headers: getAuthHeaders() }
    );
    return handleResponse<StoredAnalysisResult>(res);
}

export async function fetchRepositoryFiles(
    id: string
): Promise<AnalyzedFileSummary[]> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/files`,
        { headers: getAuthHeaders() }
    );
    return handleResponse<AnalyzedFileSummary[]>(res);
}

export async function fetchRepositoryFileContent(
    id: string,
    filePath: string
): Promise<AnalyzedFileContent> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/files?path=${encodeURIComponent(filePath)}`,
        { headers: getAuthHeaders() }
    );
    return handleResponse<AnalyzedFileContent>(res);
}

export async function fetchRepositoryFlows(
    id: string
): Promise<CodeFlowsResponse> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/flows`,
        { headers: getAuthHeaders() }
    );
    return handleResponse<CodeFlowsResponse>(res);
}

export async function fetchRepositoryFlowById(
    id: string,
    flowId: string
): Promise<CodeFlowGraph> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}`,
        { headers: getAuthHeaders() }
    );
    return handleResponse<CodeFlowGraph>(res);
}

export async function askRepositoryQuestion(
    id: string,
    query: string,
    signal?: AbortSignal
): Promise<AskRepositoryResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 45000);

    if (signal) {
        signal.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            controller.abort();
        });
    }

    try {
        const res = await fetch(
            `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/ask?q=${encodeURIComponent(query)}`,
            {
                signal: controller.signal,
                headers: getAuthHeaders()
            }
        );
        return await handleResponse<AskRepositoryResponse>(res);
    } catch (err: any) {
        if (err.name === "AbortError" || controller.signal.aborted) {
            throw new Error("Request timed out after 45 seconds while waiting for AI response.");
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function analyzeRepository(
    url: string
): Promise<StoredAnalysisResult> {
    const res = await fetch(`${API_BASE_URL}/repositories/analyze`, {
        method: "POST",
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify({ url })
    });

    return handleResponse<StoredAnalysisResult>(res);
}

// User-specific endpoints
export async function fetchCurrentUser(): Promise<{ user: any }> {
    const res = await fetch(`${API_BASE_URL}/user/me`, {
        headers: getAuthHeaders()
    });
    return handleResponse<{ user: any }>(res);
}

export async function fetchUserRepositories(): Promise<StoredRepository[]> {
    const res = await fetch(`${API_BASE_URL}/user/repositories`, {
        headers: getAuthHeaders()
    });
    return handleResponse<StoredRepository[]>(res);
}

export async function linkUserRepository(repositoryId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/user/repositories/${encodeURIComponent(repositoryId)}`, {
        method: "POST",
        headers: getAuthHeaders()
    });
    return handleResponse<any>(res);
}

export async function fetchUserChatMessages(repositoryId: string): Promise<PersistedChatMessage[]> {
    const res = await fetch(`${API_BASE_URL}/user/repositories/${encodeURIComponent(repositoryId)}/chat/messages`, {
        headers: getAuthHeaders()
    });
    return handleResponse<PersistedChatMessage[]>(res);
}

export async function saveUserChatMessage(
    repositoryId: string,
    role: "user" | "assistant",
    content: string,
    citations: any[] = []
): Promise<PersistedChatMessage> {
    const res = await fetch(`${API_BASE_URL}/user/repositories/${encodeURIComponent(repositoryId)}/chat/messages`, {
        method: "POST",
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify({ role, content, citations })
    });
    return handleResponse<PersistedChatMessage>(res);
}

export async function clearUserChatMessages(repositoryId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/user/repositories/${encodeURIComponent(repositoryId)}/chat/messages`, {
        method: "DELETE",
        headers: getAuthHeaders()
    });
    await handleResponse<{ message: string }>(res);
}
