import dotenv from "dotenv";

dotenv.config();

const githubHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeLens"
};

if (process.env.GITHUB_TOKEN) {
    githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

console.log(
    "GitHub token loaded:",
    !!process.env.GITHUB_TOKEN
);

async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 3
): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(30000)
            });
        } catch (error) {
            lastError = error;

            console.log(
                `GitHub request failed (attempt ${attempt}/${retries})`
            );

            if (attempt < retries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, 1000 * attempt)
                );
            }
        }
    }

    throw lastError;
}

export async function getRepository(
    owner: string,
    repo: string
) {
    const response = await fetchWithRetry(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
            headers: githubHeaders
        }
    );

    if (!response.ok) {
        const data = await response.json();

        throw new Error(
            `GitHub API error ${response.status}: ${data.message}`
        );
    }

    return response.json();
}

export interface NormalizedRepoIdentity {
    owner: string;
    repo: string;
    fullName: string;
    canonicalUrl: string;
}

/**
 * Consistently normalizes a GitHub repository URL or slug into a stable identity.
 * Handles trailing slashes, .git extensions, branch subpaths, and case.
 */
export function normalizeGitHubRepo(rawUrl: string): NormalizedRepoIdentity | null {
    if (!rawUrl || typeof rawUrl !== "string") {
        return null;
    }

    let cleaned = rawUrl.trim();

    // Remove leading/trailing quotes or brackets
    cleaned = cleaned.replace(/^['"<]+|['">]+$/g, "");

    // If starts with git@github.com:owner/repo
    if (cleaned.startsWith("git@github.com:")) {
        cleaned = "https://github.com/" + cleaned.slice("git@github.com:".length);
    }

    // If bare slug "owner/repo"
    if (!cleaned.includes("://") && !cleaned.startsWith("github.com")) {
        const parts = cleaned.split("/").filter(Boolean);
        if (parts.length === 2) {
            const owner = parts[0];
            const repo = parts[1].replace(/\.git$/i, "");
            return {
                owner,
                repo,
                fullName: `${owner}/${repo}`,
                canonicalUrl: `https://github.com/${owner}/${repo}`
            };
        }
    }

    try {
        let urlObj: URL;
        if (!cleaned.includes("://")) {
            urlObj = new URL(`https://${cleaned}`);
        } else {
            urlObj = new URL(cleaned);
        }

        if (urlObj.hostname !== "github.com" && urlObj.hostname !== "www.github.com") {
            return null;
        }

        const segments = urlObj.pathname.split("/").filter(Boolean);
        if (segments.length < 2) {
            return null;
        }

        const owner = segments[0];
        const repo = segments[1].replace(/\.git$/i, "");

        return {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
            canonicalUrl: `https://github.com/${owner}/${repo}`
        };
    } catch {
        return null;
    }
}

/**
 * Fetches the latest commit SHA for a repository ref (branch, tag, or commit).
 */
export async function getLatestCommitSha(
    owner: string,
    repo: string,
    ref: string = "HEAD"
): Promise<string> {
    const data = await githubRequest<{ sha: string }>(
        `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`
    );
    return data.sha;
}

export async function githubRequest<T>(
    endpoint: string
): Promise<T> {
    const response = await fetchWithRetry(
        `https://api.github.com${endpoint}`,
        {
            headers: githubHeaders
        }
    );

    if (!response.ok) {
        const data = await response.json();

        throw new Error(
            `GitHub API error ${response.status}: ${data.message}`
        );
    }

    return response.json();
}