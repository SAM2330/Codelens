import {
    StoredRepository,
    StoredAnalysisResult,
    CodeFlowsResponse,
    CodeFlowGraph,
    AnalyzedFileSummary,
    AnalyzedFileContent
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

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
    const res = await fetch(`${API_BASE_URL}/repositories`);
    return handleResponse<StoredRepository[]>(res);
}

export async function fetchRepositoryById(
    id: string
): Promise<StoredAnalysisResult> {
    const res = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(id)}`);
    return handleResponse<StoredAnalysisResult>(res);
}

export async function fetchRepositoryFiles(
    id: string
): Promise<AnalyzedFileSummary[]> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/files`
    );
    return handleResponse<AnalyzedFileSummary[]>(res);
}

export async function fetchRepositoryFileContent(
    id: string,
    filePath: string
): Promise<AnalyzedFileContent> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/files?path=${encodeURIComponent(filePath)}`
    );
    return handleResponse<AnalyzedFileContent>(res);
}

export async function fetchRepositoryFlows(
    id: string
): Promise<CodeFlowsResponse> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/flows`
    );
    return handleResponse<CodeFlowsResponse>(res);
}

export async function fetchRepositoryFlowById(
    id: string,
    flowId: string
): Promise<CodeFlowGraph> {
    const res = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(id)}/flows/${encodeURIComponent(flowId)}`
    );
    return handleResponse<CodeFlowGraph>(res);
}

export async function analyzeRepository(
    url: string
): Promise<StoredAnalysisResult> {
    const res = await fetch(`${API_BASE_URL}/repositories/analyze`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
    });

    return handleResponse<StoredAnalysisResult>(res);
}
