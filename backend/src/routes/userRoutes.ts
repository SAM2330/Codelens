import { Router } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import {
    getCurrentUser,
    getUserRepositoriesHandler,
    linkUserRepositoryHandler,
    getUserChatMessagesHandler,
    saveUserChatMessageHandler,
    clearUserChatMessagesHandler
} from "../controllers/userController";

const router = Router();

// User profile & repositories
router.get("/me", requireAuth, getCurrentUser);
router.get("/repositories", requireAuth, getUserRepositoriesHandler);
router.post("/repositories/:id", requireAuth, linkUserRepositoryHandler);

// User-specific chat history
router.get("/repositories/:id/chat/messages", requireAuth, getUserChatMessagesHandler);
router.post("/repositories/:id/chat/messages", requireAuth, saveUserChatMessageHandler);
router.delete("/repositories/:id/chat/messages", requireAuth, clearUserChatMessagesHandler);

export default router;
