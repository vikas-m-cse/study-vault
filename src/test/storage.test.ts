// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import {
    DB_NAME,
    DB_VERSION,
    openStudyVaultDB,
    STORE_FILES,
    STORE_FOLDERS,
    STORE_NOTES,
    STORE_RESOURCES,
    STORE_SUBJECTS,
} from "../services/database";
import {
    deleteResource,
    loadResources,
    saveResource,
    saveSubjects,
} from "../services/storage";
import type { Resource } from "../types/resource";

type StoredResource = Resource & { hasFile: boolean };
type StoredFile = { id: string; blob: Blob; name: string; mimeType: string };

const subject = {
    id: 1,
    name: "Testing",
    description: "Storage test subject",
    color: "blue",
};

function readStore<T>(storeName: string): Promise<T[]> {
    return openStudyVaultDB().then((db) => new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
    }));
}

function makeResource(id: string, file: File): Resource {
    return {
        id,
        title: "Original resource",
        description: "Description",
        type: "Document",
        subjectId: subject.id,
        createdAt: "2026-10-04T00:00:00.000Z",
        file,
    };
}

describe("database and resource storage", () => {
    beforeEach(async () => {
        await saveSubjects([subject]);
    });

    it("opens v2 with all expected stores and stable key paths", async () => {
        const db = await openStudyVaultDB();
        expect(DB_NAME).toBe("studyvault_test_db");
        expect(db.version).toBe(DB_VERSION);

        const expectedStores = [
            STORE_SUBJECTS,
            STORE_RESOURCES,
            STORE_FILES,
            STORE_NOTES,
            STORE_FOLDERS,
        ];
        expect(expectedStores.every((name) => db.objectStoreNames.contains(name))).toBe(true);

        const tx = db.transaction(expectedStores, "readonly");
        expect(tx.objectStore(STORE_SUBJECTS).keyPath).toBe("id");
        expect(tx.objectStore(STORE_RESOURCES).keyPath).toBe("id");
        expect(tx.objectStore(STORE_FILES).keyPath).toBe("id");
        expect(tx.objectStore(STORE_NOTES).keyPath).toBe("id");
        expect(tx.objectStore(STORE_FOLDERS).keyPath).toBe("id");
    });

    it("shares concurrent open requests", async () => {
        const connections = await Promise.all([
            openStudyVaultDB(),
            openStudyVaultDB(),
            openStudyVaultDB(),
        ]);
        expect(connections[0]).toBe(connections[1]);
        expect(connections[1]).toBe(connections[2]);
    });

    it("creates, updates, replaces, transitions, and deletes real attachments safely", async () => {
        const firstFile = new File(["alpha"], "alpha.txt", { type: "text/plain" });
        const resource = makeResource("resource-one", firstFile);
        await saveResource(resource);

        let storedResources = await readStore<StoredResource>(STORE_RESOURCES);
        let storedFiles = await readStore<StoredFile>(STORE_FILES);
        expect(storedResources[0].hasFile).toBe(true);
        expect(storedFiles[0].name).toBe("alpha.txt");
        expect(await (await loadResources())[0].file?.text()).toBe("alpha");

        await saveResource({ ...resource, title: "Metadata only", file: undefined });
        expect((await readStore<StoredResource>(STORE_RESOURCES))[0].title).toBe("Metadata only");
        expect(await (await loadResources())[0].file?.text()).toBe("alpha");

        const secondFile = new File(["beta"], "beta.txt", { type: "text/plain" });
        await saveResource({ ...resource, title: "Replaced", file: secondFile });
        storedFiles = await readStore<StoredFile>(STORE_FILES);
        expect(storedFiles[0].name).toBe("beta.txt");
        expect(await (await loadResources())[0].file?.text()).toBe("beta");

        await saveResource({ ...resource, type: "Link", url: "https://example.com", file: secondFile });
        storedResources = await readStore<StoredResource>(STORE_RESOURCES);
        storedFiles = await readStore<StoredFile>(STORE_FILES);
        expect(storedResources[0].hasFile).toBe(false);
        expect(storedFiles).toHaveLength(0);

        await saveResource({ ...resource, type: "Note", content: "plain text", file: secondFile });
        storedResources = await readStore<StoredResource>(STORE_RESOURCES);
        expect(storedResources[0].hasFile).toBe(false);
        expect(await readStore<StoredFile>(STORE_FILES)).toHaveLength(0);

        const unrelated = makeResource(
            "resource-two",
            new File(["unrelated"], "unrelated.txt", { type: "text/plain" })
        );
        await saveResource(unrelated);
        await deleteResource(resource.id);
        storedFiles = await readStore<StoredFile>(STORE_FILES);
        expect(storedFiles.map((file) => file.id)).toEqual([unrelated.id]);
        expect(await (await loadResources()).find((item) => item.id === unrelated.id)?.file?.text()).toBe("unrelated");
    });

    it("preserves the previous state when a resource write fails", async () => {
        const resource = makeResource(
            "resource-failure",
            new File(["before"], "before.txt", { type: "text/plain" })
        );
        await saveResource(resource);

        const originalPut = IDBObjectStore.prototype.put;
        Object.defineProperty(IDBObjectStore.prototype, "put", {
            configurable: true,
            value: function(this: IDBObjectStore, value: unknown) {
                if (this.name === STORE_RESOURCES && (value as { id?: string }).id === resource.id) {
                    throw new DOMException("Injected failure", "QuotaExceededError");
                }
                return originalPut.call(this, value);
            },
        });

        try {
            await expect(saveResource({
                ...resource,
                title: "Should not commit",
                file: new File(["after"], "after.txt", { type: "text/plain" }),
            })).rejects.toThrow();
        } finally {
            Object.defineProperty(IDBObjectStore.prototype, "put", {
                configurable: true,
                value: originalPut,
            });
        }

        const saved = (await readStore<StoredResource>(STORE_RESOURCES)).find((item) => item.id === resource.id);
        const file = (await readStore<StoredFile>(STORE_FILES)).find((item) => item.id === resource.id);
        expect(saved?.title).toBe("Original resource");
        expect(file?.name).toBe("before.txt");
        expect(await file?.blob.text()).toBe("before");
    });
});
