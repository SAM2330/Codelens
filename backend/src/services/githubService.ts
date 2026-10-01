export async function getRepository(owner: string, repo: string) {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`
    );

    if (!response.ok) {
        throw new Error("Repository not found");
    }

    return response.json();
}
export async function getRepositoryTree(
    owner: string,
    repo: string,
    branch: string
) {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );

    if (!response.ok) {
        throw new Error("Failed to fetch repository tree");
    }

    const data = await response.json();

    const allowedExtensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".css",
    ".scss",
    ".html",
    ".md"
];

const ignoredDirectories = [
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".git"
];

const files = data.tree.filter((item: any) => {
    if (item.type !== "blob") {
        return false;
    }

    if (
        ignoredDirectories.some((directory) =>
            item.path.includes(`${directory}/`)
        )
    ) {
        return false;
    }

    return allowedExtensions.some((extension) =>
        item.path.endsWith(extension)
    );
});

return files;

    return files;
}
export async function getFileContent(
    owner: string,
    repo: string,
    path: string
) {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${path}`);
    }

    const data = await response.json();

    return Buffer.from(data.content, "base64").toString("utf-8");
}