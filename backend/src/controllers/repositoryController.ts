import { Request, Response } from "express";
import { getRepository } from "../services/githubService";
import { downloadRepository } from "../services/repositoryService";
import {
    analyzeFile,
    RepositoryFile,
    shouldAnalyzeFile
} from "../services/repositoryAnalyzer";

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

        const directory = await downloadRepository(
            owner,
            repo,
            repository.default_branch
        );

     const files = directory.files
    .filter((file) => file.type === "File")
    .filter((file) => shouldAnalyzeFile(file.path));

const repositoryFiles: RepositoryFile[] = await Promise.all(
    files.map(async (file) => {
        const content = await file.buffer();

        return {
            path: file.path,
            size: file.uncompressedSize,
            content: content.toString("utf-8")
        };
    })
);

const analyzedFiles = repositoryFiles.map(analyzeFile);
        // res.json({
        //     repository,
        //     files:analyzedFiles
        // });
        res.json({
    repository,
    files: analyzedFiles.map((file) => ({
        path: file.path,
        language: file.language,
        type: file.type,
        area: file.area,
        imports: file.imports,
        structure: file.structure
    }))
});
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to analyze repository",
            error: error instanceof Error
                ? error.message
                : "Unknown error"
        });
    }
}