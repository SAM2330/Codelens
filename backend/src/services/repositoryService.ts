import unzipper from "unzipper";
import dotenv from "dotenv";

dotenv.config();

const githubHeaders: Record<string, string> = {
    "User-Agent": "CodeLens"
};

if (process.env.GITHUB_TOKEN) {
    githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

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
                signal: AbortSignal.timeout(60000)
            });
        } catch (error) {
            lastError = error;
            console.log(`Repository download attempt ${attempt}/${retries} failed...`);
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
            }
        }
    }

    throw lastError;
}

export async function downloadRepository(
    owner: string,
    repo: string,
    branch: string
) {
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
    const response = await fetchWithRetry(url, {
        headers: githubHeaders
    });

    if (!response.ok) {
        throw new Error(`Failed to download repository: HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    const directory = await unzipper.Open.buffer(
        Buffer.from(buffer)
    );

    return directory;
}

export async function readRepositoryFile(
    directory: unzipper.CentralDirectory,
    path: string
) {
    const file = directory.files.find(
        (file) => file.path === path
    );

    if (!file) {
        throw new Error(`File not found: ${path}`);
    }

    return file.buffer();
}