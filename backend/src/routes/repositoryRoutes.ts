import { Router } from "express";
import { analyzeRepository } from "../controllers/repositoryController";

const router = Router();

router.post("/analyze", analyzeRepository);

export default router;