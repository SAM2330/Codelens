import { Request, Response } from "express";
import {
    getUserRepositories,
    getUserChatMessages,
    saveUserChatMessage,
    clearUserChatMessages,
    linkUserRepository,
    checkUserRepositoryAccess
} from "../db/repositories/repositoryDb";

export async function getCurrentUser(req: Request, res: Response) {
    if (!req.user) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    return res.json({
        user: req.user
    });
}

export async function getUserRepositoriesHandler(req: Request, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const repos = await getUserRepositories(req.user.id);
        return res.json(repos);
    } catch (error) {
        console.error("Failed to fetch user repositories:", error);
        return res.status(500).json({
            message: "Failed to fetch repositories",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function linkUserRepositoryHandler(req: Request, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const rawRepoId = req.params.id;
        const repositoryId = Array.isArray(rawRepoId) ? rawRepoId[0] : rawRepoId;

        if (!repositoryId) {
            return res.status(400).json({ message: "Repository ID is required" });
        }

        const access = await checkUserRepositoryAccess(req.user.id, repositoryId);
        if (access.notFound) {
            return res.status(404).json({ message: "Repository not found" });
        }

        await linkUserRepository(req.user.id, access.repository.id, "viewer");
        return res.json({
            message: "Repository successfully linked to user account",
            repositoryId: access.repository.id
        });
    } catch (error) {
        console.error("Failed to link repository to user:", error);
        return res.status(500).json({
            message: "Failed to link repository",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getUserChatMessagesHandler(req: Request, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const rawRepoId = req.params.id;
        const repositoryId = Array.isArray(rawRepoId) ? rawRepoId[0] : rawRepoId;

        if (!repositoryId) {
            return res.status(400).json({ message: "Repository ID is required" });
        }

        // Verify repository access
        const access = await checkUserRepositoryAccess(req.user.id, repositoryId);
        if (access.notFound) {
            return res.status(404).json({ message: "Repository not found" });
        }
        if (!access.allowed) {
            return res.status(403).json({ message: "Access forbidden to this repository" });
        }

        const messages = await getUserChatMessages(req.user.id, access.repository.id);
        return res.json(messages);
    } catch (error) {
        console.error("Failed to fetch chat messages:", error);
        return res.status(500).json({
            message: "Failed to fetch chat messages",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function saveUserChatMessageHandler(req: Request, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const rawRepoId = req.params.id;
        const repositoryId = Array.isArray(rawRepoId) ? rawRepoId[0] : rawRepoId;
        const { role, content, citations } = req.body;

        if (!repositoryId || !role || !content) {
            return res.status(400).json({
                message: "Repository ID, role ('user' | 'assistant'), and content are required"
            });
        }

        if (role !== "user" && role !== "assistant") {
            return res.status(400).json({ message: "Role must be 'user' or 'assistant'" });
        }

        const access = await checkUserRepositoryAccess(req.user.id, repositoryId);
        if (access.notFound) {
            return res.status(404).json({ message: "Repository not found" });
        }
        if (!access.allowed) {
            return res.status(403).json({ message: "Access forbidden to this repository" });
        }

        const savedMessage = await saveUserChatMessage(
            req.user.id,
            access.repository.id,
            role,
            content,
            citations || []
        );

        return res.status(201).json(savedMessage);
    } catch (error) {
        console.error("Failed to save chat message:", error);
        return res.status(500).json({
            message: "Failed to save chat message",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function clearUserChatMessagesHandler(req: Request, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const rawRepoId = req.params.id;
        const repositoryId = Array.isArray(rawRepoId) ? rawRepoId[0] : rawRepoId;

        if (!repositoryId) {
            return res.status(400).json({ message: "Repository ID is required" });
        }

        const access = await checkUserRepositoryAccess(req.user.id, repositoryId);
        if (access.notFound) {
            return res.status(404).json({ message: "Repository not found" });
        }

        await clearUserChatMessages(req.user.id, access.repository.id);
        return res.json({ message: "Chat history cleared successfully" });
    } catch (error) {
        console.error("Failed to clear chat history:", error);
        return res.status(500).json({
            message: "Failed to clear chat history",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}
