import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 24000;
const BATCH_SIZE = 25;

export interface ChunkToEmbed {
    id: string;
    filePath: string;
    symbol: string;
    symbolType: string;
    content: string;
    contentHash?: string;
}

export interface GeneratedEmbedding {
    id: string;
    embedding: number[];
    contentHash: string;
    model: string;
}

export interface EmbeddingBatchResult {
    embeddings: GeneratedEmbedding[];
    failedChunkIds: string[];
    quotaExceeded: boolean;
    quotaErrorMessage?: string;
    totalTokens?: number;
    model: string;
    dimensions: number;
}

export function formatChunkForEmbedding(chunk: {
    filePath: string;
    symbol: string;
    symbolType: string;
    content: string;
}): string {
    let content = chunk.content;
    if (content.length > MAX_CHUNK_CHARS) {
        content =
            content.slice(0, MAX_CHUNK_CHARS) +
            "\n\n// [Content truncated for embedding limit]";
    }

    return `File: ${chunk.filePath}\nSymbol: ${chunk.symbol}\nType: ${chunk.symbolType}\n\n<code>\n${content}\n</code>`;
}

export function computeContentHash(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex");
}

export function isQuotaExceededError(error: unknown): boolean {
    if (!error) return false;

    if (typeof error === "object") {
        const err = error as Record<string, any>;

        if (
            err.status === 429 ||
            err.code === 429 ||
            err.statusCode === 429 ||
            err.status === "RESOURCE_EXHAUSTED" ||
            err.error?.code === 429 ||
            err.error?.status === "RESOURCE_EXHAUSTED"
        ) {
            return true;
        }

        const message = String(
            err.message || err.error?.message || err.details || ""
        );
        if (
            message.includes("429") ||
            message.includes("RESOURCE_EXHAUSTED") ||
            message.includes("quota") ||
            message.includes("Quota exceeded") ||
            message.includes("Resource has been exhausted") ||
            message.includes("rate limit")
        ) {
            return true;
        }
    }

    const str = String(error);
    return (
        str.includes("429") ||
        str.includes("RESOURCE_EXHAUSTED") ||
        str.includes("quota") ||
        str.includes("Quota exceeded") ||
        str.includes("Resource has been exhausted") ||
        str.includes("rate limit")
    );
}

function getGenAIClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY is not configured in environment variables. Please set GEMINI_API_KEY to generate embeddings."
        );
    }

    return new GoogleGenAI({
        apiKey
    });
}

export async function generateEmbeddingsForChunks(
    chunks: ChunkToEmbed[]
): Promise<EmbeddingBatchResult> {
    if (chunks.length === 0) {
        return {
            embeddings: [],
            failedChunkIds: [],
            quotaExceeded: false,
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS
        };
    }

    const ai = getGenAIClient();
    const successfulEmbeddings: GeneratedEmbedding[] = [];
    const failedChunkIds: string[] = [];
    let quotaExceeded = false;
    let quotaErrorMessage: string | undefined;

    // Process in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const formattedBatch = batch.map((chunk) =>
            formatChunkForEmbedding(chunk)
        );

        try {
            // Attempt batch embedding
            const response = await ai.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: formattedBatch,
                config: {
                    outputDimensionality: EMBEDDING_DIMENSIONS
                }
            });

            const returnedEmbeddings = response.embeddings || [];

            if (returnedEmbeddings.length === batch.length) {
                for (let j = 0; j < batch.length; j++) {
                    const chunk = batch[j];
                    const values = returnedEmbeddings[j]?.values;

                    if (values && values.length === EMBEDDING_DIMENSIONS) {
                        successfulEmbeddings.push({
                            id: chunk.id,
                            embedding: values,
                            contentHash:
                                chunk.contentHash ||
                                computeContentHash(formattedBatch[j]),
                            model: EMBEDDING_MODEL
                        });
                    } else {
                        failedChunkIds.push(chunk.id);
                    }
                }
            } else {
                // Fallback to individual chunk calls if response count differs
                for (let j = 0; j < batch.length; j++) {
                    const chunk = batch[j];
                    try {
                        const singleRes = await ai.models.embedContent({
                            model: EMBEDDING_MODEL,
                            contents: formattedBatch[j],
                            config: {
                                outputDimensionality: EMBEDDING_DIMENSIONS
                            }
                        });

                        const values =
                            singleRes.embeddings?.[0]?.values ||
                            (singleRes as any).embedding?.values;

                        if (values && values.length === EMBEDDING_DIMENSIONS) {
                            successfulEmbeddings.push({
                                id: chunk.id,
                                embedding: values,
                                contentHash:
                                    chunk.contentHash ||
                                    computeContentHash(formattedBatch[j]),
                                model: EMBEDDING_MODEL
                            });
                        } else {
                            failedChunkIds.push(chunk.id);
                        }
                    } catch (singleErr) {
                        if (isQuotaExceededError(singleErr)) {
                            console.warn(
                                "Gemini API quota exceeded (429 / RESOURCE_EXHAUSTED). Stopping further requests."
                            );
                            quotaExceeded = true;
                            quotaErrorMessage =
                                singleErr instanceof Error
                                    ? singleErr.message
                                    : "Quota exceeded (RESOURCE_EXHAUSTED / 429)";
                            const unhandled = chunks.slice(i + j);
                            failedChunkIds.push(...unhandled.map((c) => c.id));
                            break;
                        }

                        console.error(
                            `Failed to embed individual chunk ${chunk.id}:`,
                            singleErr
                        );
                        failedChunkIds.push(chunk.id);
                    }
                }

                if (quotaExceeded) {
                    break;
                }
            }
        } catch (batchError) {
            // If quota is exceeded on the batch, stop immediately without retrying
            if (isQuotaExceededError(batchError)) {
                console.warn(
                    "Gemini API quota exceeded (429 / RESOURCE_EXHAUSTED). Stopping further requests immediately."
                );
                quotaExceeded = true;
                quotaErrorMessage =
                    batchError instanceof Error
                        ? batchError.message
                        : "Quota exceeded (RESOURCE_EXHAUSTED / 429)";
                const unhandled = chunks.slice(i);
                failedChunkIds.push(...unhandled.map((c) => c.id));
                break;
            }

            console.warn(
                `Batch embedding failed for ${batch.length} chunks, retrying individually:`,
                batchError instanceof Error ? batchError.message : batchError
            );

            // Retry item by item only for non-quota errors
            for (let j = 0; j < batch.length; j++) {
                const chunk = batch[j];
                try {
                    const singleRes = await ai.models.embedContent({
                        model: EMBEDDING_MODEL,
                        contents: formattedBatch[j],
                        config: {
                            outputDimensionality: EMBEDDING_DIMENSIONS
                        }
                    });

                    const values =
                        singleRes.embeddings?.[0]?.values ||
                        (singleRes as any).embedding?.values;

                    if (values && values.length === EMBEDDING_DIMENSIONS) {
                        successfulEmbeddings.push({
                            id: chunk.id,
                            embedding: values,
                            contentHash:
                                chunk.contentHash ||
                                computeContentHash(formattedBatch[j]),
                            model: EMBEDDING_MODEL
                        });
                    } else {
                        failedChunkIds.push(chunk.id);
                    }
                } catch (singleErr) {
                    if (isQuotaExceededError(singleErr)) {
                        console.warn(
                            "Gemini API quota exceeded (429 / RESOURCE_EXHAUSTED) during retry. Stopping further requests immediately."
                        );
                        quotaExceeded = true;
                        quotaErrorMessage =
                            singleErr instanceof Error
                                ? singleErr.message
                                : "Quota exceeded (RESOURCE_EXHAUSTED / 429)";
                        const unhandled = chunks.slice(i + j);
                        failedChunkIds.push(...unhandled.map((c) => c.id));
                        break;
                    }

                    console.error(
                        `Failed to embed chunk ${chunk.id}:`,
                        singleErr
                    );
                    failedChunkIds.push(chunk.id);
                }
            }

            if (quotaExceeded) {
                break;
            }
        }
    }

    return {
        embeddings: successfulEmbeddings,
        failedChunkIds,
        quotaExceeded,
        quotaErrorMessage,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS
    };
}
