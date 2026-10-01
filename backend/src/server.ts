import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import repositoryRoutes from "./routes/repositoryRoutes";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/repositories", repositoryRoutes);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.json({
        message: "CodeLens API is running"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});