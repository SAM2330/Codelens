import { Request, Response } from "express";
import { getRepository } from "../services/githubService";
import { downloadRepository } from "../services/repositoryService";
import {
    analyzeFile,
    RepositoryFile,
    shouldAnalyzeFile
} from "../services/repositoryAnalyzer";
import { buildDependencyGraph } from "../services/dependencyAnalyzer";
import { analyzeProject } from "../services/projectAnalyzer";
import { analyzeArchitecture } from "../services/architectureAnalyzer";
import { analyzeAPIs } from "../services/apiAnalyzer";
import { analyzeDatabase } from "../services/databaseAnalyzer";
import { analyzeCodeFlows } from "../services/codeFlowAnalyzer";

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
const dependencies = buildDependencyGraph(analyzedFiles);
const projectAnalysis = analyzeProject(analyzedFiles);
const architecture = analyzeArchitecture(
    projectAnalysis,
    analyzedFiles,
    dependencies
);
const apiAnalysis = analyzeAPIs(analyzedFiles);

const databaseAnalysis = analyzeDatabase(analyzedFiles);
const codeFlows = analyzeCodeFlows(
    analyzedFiles,
    dependencies,
    apiAnalysis
);
        // res.json({
        //     repository,
        //     files:analyzedFiles
        // });
        res.json({
    repository,

    project: projectAnalysis,

    architecture,

    api: apiAnalysis,

    database: databaseAnalysis,
     
    codeFlows,

    files: analyzedFiles.map((file) => ({
        path: file.path,
        language: file.language,
        type: file.type,
        area: file.area,
        imports: file.imports,
        structure: file.structure
    })),

    dependencies
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