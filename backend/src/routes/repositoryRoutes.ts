import { Router } from "express";
import {
    analyzeRepository,
    getRepositories,
    getRepositoryById,
    getRepositoryChunks,
    embedRepositoryChunks,
    searchRepositoryChunks,
    getRepositoryContext,
    askRepository
} from "../controllers/repositoryController";

const router = Router();

router.get("/", getRepositories);
router.get("/:id/ask", askRepository);
router.get("/:id/context", getRepositoryContext);
router.get("/:id/search", searchRepositoryChunks);
router.get("/:id/chunks", getRepositoryChunks);
router.get("/:id", getRepositoryById);
router.post("/:id/embed", embedRepositoryChunks);
router.post("/analyze", analyzeRepository);

export default router;