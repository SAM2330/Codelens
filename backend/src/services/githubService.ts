import dotenv from "dotenv";

dotenv.config();
const githubHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeLens"
};

if (process.env.GITHUB_TOKEN) {
    githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

export async function getRepository(owner: string, repo: string) {
    const response = await fetch(
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