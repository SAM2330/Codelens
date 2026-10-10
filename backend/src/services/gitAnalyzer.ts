import { githubRequest } from "./githubService";

export type GitCommit = {
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
    parents?: string[];
    body?: string;
};

export type GitContributor = {
    login: string;
    contributions: number;
};

export type GitHotFile = {
    file: string;
    commits: number;
};

export type GitFileChange = {
    commit: string;
    file: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
};

export type GitAnalysis = {
    commits: GitCommit[];
    contributors: GitContributor[];
    hotFiles: GitHotFile[];
    recentChanges: GitFileChange[];
};

type GitHubCommit = {
    sha: string;
    parents?: { sha: string }[];
    commit: {
        message: string;
        author: {
            name: string | null;
            date: string | null;
        } | null;
    };
};

type GitHubCommitDetail = {
    sha: string;
    parents?: { sha: string }[];
    files?: {
        filename: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
    }[];
};

type GitHubContributor = {
    login?: string;
    contributions: number;
};

export async function analyzeGitHistory(
    owner: string,
    repo: string
): Promise<GitAnalysis> {
    const commitLimit = 15;

    const commitsResponse = await githubRequest<GitHubCommit[]>(
        `/repos/${owner}/${repo}/commits?per_page=${commitLimit}`
    );

    const contributorsResponse =
        await githubRequest<GitHubContributor[]>(
            `/repos/${owner}/${repo}/contributors?per_page=10`
        );

    const commits: GitCommit[] = commitsResponse.map(
        (commit) => ({
            sha: commit.sha,
            message: commit.commit.message
                .split("\n")[0],
            body: commit.commit.message.includes("\n")
                ? commit.commit.message
                : undefined,
            author: commit.commit.author?.name || null,
            date: commit.commit.author?.date || null,
            parents: commit.parents?.map((p) => p.sha) || []
        })
    );

    const contributors: GitContributor[] =
        contributorsResponse
            .filter((contributor) => contributor.login)
            .map((contributor) => ({
                login: contributor.login!,
                contributions: contributor.contributions
            }));

    const recentChanges: GitFileChange[] = [];

    for (const commit of commitsResponse) {
        try {
            const details =
                await githubRequest<GitHubCommitDetail>(
                    `/repos/${owner}/${repo}/commits/${commit.sha}`
                );

            for (const file of details.files || []) {
                const rawPatch = file.patch;
                const patch = rawPatch
                    ? rawPatch.length > 1500
                        ? rawPatch.slice(0, 1500) + "\n...[diff truncated]"
                        : rawPatch
                    : undefined;

                recentChanges.push({
                    commit: commit.sha,
                    file: file.filename,
                    additions: file.additions,
                    deletions: file.deletions,
                    changes: file.changes,
                    patch
                });
            }
        } catch {
            // Ignore individual commit failures
        }
    }

    const fileCommitCounts = new Map<string, number>();

    for (const change of recentChanges) {
        fileCommitCounts.set(
            change.file,
            (fileCommitCounts.get(change.file) || 0) + 1
        );
    }

    const hotFiles: GitHotFile[] = [
        ...fileCommitCounts.entries()
    ]
        .map(([file, commits]) => ({
            file,
            commits
        }))
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 10);

    return {
        commits,
        contributors,
        hotFiles,
        recentChanges
    };
}