import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import repositoryRoutes from "./routes/repositoryRoutes";
import userRoutes from "./routes/userRoutes";
import { initializeDatabase } from "./db/init";
import { isDatabaseConfigured } from "./db/client";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/repositories", repositoryRoutes);
app.use("/api/user", userRoutes);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.json({
        message: "CodeLens API is running"
    });
});

async function startServer() {
    if (isDatabaseConfigured()) {
        console.log("Database connection configured. Initializing schema...");
        await initializeDatabase();
    } else {
        console.log("Note: Database not configured. Set DATABASE_URL in .env to enable persistence.");
    }

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();