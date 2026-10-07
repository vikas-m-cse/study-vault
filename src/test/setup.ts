import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { DB_NAME, resetStudyVaultDBForTests } from "../services/database";

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`Test database deletion blocked: ${name}`));
    });
}

afterEach(async () => {
    cleanup();
    resetStudyVaultDBForTests();
    await deleteDatabase(DB_NAME);
});
