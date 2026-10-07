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
import {
    analyzeGitHistory,
    GitAnalysis
} from "../services/gitAnalyzer";
import { analyzeStaticCode } from "../services/staticAnalyzer";

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
console.log("1. Getting repository...");
        const repository = await getRepository(owner, repo);
console.log("2. Downloading repository...");
        const directory = await downloadRepository(
            owner,
            repo,
            repository.default_branch
        );
        console.log("2.Repository Downloaded");

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
console.log("4. Starting Git history...");
let gitAnalysis : GitAnalysis = {
    commits: [],
    contributors: [],
    hotFiles: [],
    recentChanges: []
};

try {
    gitAnalysis = await analyzeGitHistory(owner,repo);
        console.log("5. Git history completed");
    
} catch (error) {
    console.error("Git history analysis failed:", error);
}
console.log("6. Starting static analysis...");
const staticAnalysis = analyzeStaticCode(
    analyzedFiles
);

console.log("7. Static analysis completed");
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

    git: gitAnalysis,

    static: staticAnalysis,

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