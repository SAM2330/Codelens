import { Request, Response } from "express";
import { getRepository ,
         getRepositoryTree,
         getFileContent} from "../services/githubService";

export async function analyzeRepository(req: Request, res: Response) {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                message: "GitHub repository URL is required"
            });
        }

        const githubUrl = new URL(url);

        if (githubUrl.hostname !== "github.com") {
            return res.status(400).json({
                message: "Invalid GitHub repository URL"
            });
        }

        const parts = githubUrl.pathname
            .split("/")
            .filter(Boolean);

        if (parts.length < 2) {
            return res.status(400).json({
                message: "Invalid GitHub repository URL"
            });
        }

        const owner = parts[0];
        const repo = parts[1];

        const repository = await getRepository(owner, repo);

        const tree = await getRepositoryTree(
            owner,
            repo,
            repository.default_branch
        );
        const firstFile = tree[0];

        const content = await getFileContent(
            owner,
            repo,
            firstFile.path
        );

        res.json({
    repository,
    file: {
        path: firstFile.path,
        content
    }
});
    } catch (error) {
    console.error(error);

    res.status(500).json({
        message: "Failed to analyze repository",
        error: error instanceof Error ? error.message : "Unknown error"
    });
    }
}