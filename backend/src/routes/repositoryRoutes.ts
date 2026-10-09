import { Router } from "express";
import {
    analyzeRepository,
    getRepositories,
    getRepositoryById,
    getRepositoryFiles,
    getRepositoryChunks,
    embedRepositoryChunks,
    searchRepositoryChunks,
    getRepositoryContext,
    askRepository,
    getRepositoryFlows,
    getRepositoryFlowById
} from "../controllers/repositoryController";

const router = Router();

router.get("/", getRepositories);
router.get("/:id/ask", askRepository);
router.get("/:id/context", getRepositoryContext);
router.get("/:id/search", searchRepositoryChunks);
router.get("/:id/chunks", getRepositoryChunks);
router.get("/:id/files", getRepositoryFiles);
router.get("/:id/flows/:flowId", getRepositoryFlowById);
router.get("/:id/flows", getRepositoryFlows);
router.get("/:id", getRepositoryById);
router.post("/:id/embed", embedRepositoryChunks);
router.post("/analyze", analyzeRepository);

export default router;