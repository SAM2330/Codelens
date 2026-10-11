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
import { optionalAuth, requireRepositoryAccess } from "../middleware/auth";

const router = Router();

router.get("/", optionalAuth, getRepositories);
router.get("/:id/ask", optionalAuth, requireRepositoryAccess, askRepository);
router.get("/:id/context", optionalAuth, requireRepositoryAccess, getRepositoryContext);
router.get("/:id/search", optionalAuth, requireRepositoryAccess, searchRepositoryChunks);
router.get("/:id/chunks", optionalAuth, requireRepositoryAccess, getRepositoryChunks);
router.get("/:id/files", optionalAuth, requireRepositoryAccess, getRepositoryFiles);
router.get("/:id/flows/:flowId", optionalAuth, requireRepositoryAccess, getRepositoryFlowById);
router.get("/:id/flows", optionalAuth, requireRepositoryAccess, getRepositoryFlows);
router.get("/:id", optionalAuth, requireRepositoryAccess, getRepositoryById);
router.post("/:id/embed", optionalAuth, requireRepositoryAccess, embedRepositoryChunks);
router.post("/analyze", optionalAuth, analyzeRepository);

export default router;