import { Request, Response, NextFunction } from "express";
import { verifySupabaseToken, AuthUser } from "../services/authService";
import { checkUserRepositoryAccess } from "../db/repositories/repositoryDb";

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

/**
 * Extracts the bearer token from the Authorization header.
 */
function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
        return parts[1].trim();
    }

    return null;
}

/**
 * Middleware that requires a valid Supabase access token.
 * Returns 401 Unauthorized if the token is missing, invalid, or expired.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);

        if (!token) {
            return res.status(401).json({
                message: "Authentication required",
                error: "Missing or invalid authorization header"
            });
        }

        const user = await verifySupabaseToken(token);

        if (!user) {
            return res.status(401).json({
                message: "Authentication failed",
                error: "Invalid or expired access token"
            });
        }

        req.user = user;
        next();
    } catch (err) {
        console.warn("[Auth] requireAuth caught error during verification:", err instanceof Error ? err.message : err);
        return res.status(401).json({
            message: "Authentication failed",
            error: "Invalid or expired access token"
        });
    }
}

/**
 * Middleware that extracts the user if a valid token is provided,
 * but allows unauthenticated access for public endpoints.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);

        if (token) {
            const user = await verifySupabaseToken(token);
            if (user) {
                req.user = user;
            }
        }
    } catch (err) {
        console.warn("[Auth] optionalAuth token verification warning:", err);
    }

    next();
}

/**
 * Middleware that enforces repository authorization.
 * Checks whether the repository is private, and if so, ensures the authenticated
 * user has an explicit access record in user_repositories.
 */
export async function requireRepositoryAccess(req: Request, res: Response, next: NextFunction) {
    const rawId = req.params.id;
    const repositoryId = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!repositoryId) {
        return res.status(400).json({
            message: "Repository ID is required"
        });
    }

    // Check access in database
    const userId = req.user?.id;
    const access = await checkUserRepositoryAccess(userId, repositoryId);

    if (access.notFound) {
        return res.status(404).json({
            message: `Repository '${repositoryId}' not found`
        });
    }

    if (!access.allowed) {
        return res.status(403).json({
            message: "Access forbidden",
            error: "You do not have permission to access this private repository"
        });
    }

    next();
}
