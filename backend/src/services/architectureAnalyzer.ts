import { ProjectAnalysis } from "./projectAnalyzer";
import { AnalyzedFile } from "./repositoryAnalyzer";
import { Dependency } from "./dependencyAnalyzer";

export type ArchitectureLayer = {
    name: string;
    files: string[];
};

export type ArchitectureAnalysis = {
    style: string[];
    layers: ArchitectureLayer[];
    entryPoints: string[];
    hotspots: {
        file: string;
        dependencyCount: number;
    }[];
};

export function analyzeArchitecture(
    project: ProjectAnalysis,
    files: AnalyzedFile[],
    dependencies: Dependency[]
): ArchitectureAnalysis {
    const layers: ArchitectureLayer[] = [];

    const frontendFiles = files
        .filter((file) => file.area === "Frontend")
        .map((file) => file.path);

    const backendFiles = files
        .filter((file) => file.area === "Backend")
        .map((file) => file.path);

    const controllerFiles = files
        .filter((file) => file.type === "Controller")
        .map((file) => file.path);

    const serviceFiles = files
        .filter((file) => file.type === "Service")
        .map((file) => file.path);

    const componentFiles = files
        .filter((file) => file.type === "Component")
        .map((file) => file.path);

    const databaseFiles = files
        .filter(
            (file) =>
                file.type === "Database Schema" ||
                file.path.toLowerCase().includes("/models/")
        )
        .map((file) => file.path);

    if (frontendFiles.length > 0) {
        layers.push({
            name: "Frontend",
            files: frontendFiles
        });
    }

    if (componentFiles.length > 0) {
        layers.push({
            name: "Components",
            files: componentFiles
        });
    }

    if (backendFiles.length > 0) {
        layers.push({
            name: "Backend",
            files: backendFiles
        });
    }

    if (controllerFiles.length > 0) {
        layers.push({
            name: "Controllers",
            files: controllerFiles
        });
    }

    if (serviceFiles.length > 0) {
        layers.push({
            name: "Services",
            files: serviceFiles
        });
    }

    if (databaseFiles.length > 0) {
        layers.push({
            name: "Database",
            files: databaseFiles
        });
    }

    const style: string[] = [];

    if (project.frameworks.includes("Next.js")) {
        style.push("Next.js application");
    }

    if (
        project.frameworks.includes("React") &&
        project.architecture.frontend
    ) {
        style.push("React frontend");
    }

    if (project.libraries.includes("Express")) {
        style.push("Express backend");
    }

    if (project.libraries.includes("Prisma")) {
        style.push("Prisma data layer");
    }

    if (project.libraries.includes("TanStack Query")) {
        style.push("TanStack Query data fetching");
    }

    const entryPoints = files
        .filter((file) => {
            const path = file.path.toLowerCase();

            return (
                path.endsWith("/server.ts") ||
                path.endsWith("/server.js") ||
                path.endsWith("/main.ts") ||
                path.endsWith("/main.tsx") ||
                path.endsWith("/index.ts") ||
                path.endsWith("/index.tsx") ||
                path.endsWith("/app/page.tsx") ||
                path.endsWith("/app/page.ts")
            );
        })
        .map((file) => file.path);

    const dependencyCounts = new Map<string, number>();

    for (const dependency of dependencies) {
        dependencyCounts.set(
            dependency.from,
            (dependencyCounts.get(dependency.from) || 0) + 1
        );
    }

    const hotspots = [...dependencyCounts.entries()]
        .map(([file, dependencyCount]) => ({
            file,
            dependencyCount
        }))
        .sort((a, b) => b.dependencyCount - a.dependencyCount)
        .slice(0, 10);

    return {
        style,
        layers,
        entryPoints,
        hotspots
    };
}