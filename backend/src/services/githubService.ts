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