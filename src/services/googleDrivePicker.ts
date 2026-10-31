type DrivePickerSelection = {
    id: string;
    name: string;
    mimeType?: string;
    url?: string;
};

type GooglePickerDocument = {
    id?: string;
    name?: string;
    mimeType?: string;
    url?: string;
};

type GooglePickerData = {
    action?: string;
    docs?: GooglePickerDocument[];
};

type GooglePickerInstance = {
    setVisible: (visible: boolean) => void;
};

type GooglePickerBuilder = {
    addView: (view: unknown) => GooglePickerBuilder;
    setOAuthToken: (token: string) => GooglePickerBuilder;
    setDeveloperKey: (key: string) => GooglePickerBuilder;
    setAppId: (appId: string) => GooglePickerBuilder;
    setCallback: (callback: (data: GooglePickerData) => void) => GooglePickerBuilder;
    build: () => GooglePickerInstance;
};

type GooglePickerApi = {
    PickerBuilder: new () => GooglePickerBuilder;
    ViewId: { DOCS: string; FOLDERS: string };
    Action: { PICKED: string; CANCEL: string };
    Response: { DOCUMENTS: string };
};

type GoogleApiWindow = Window & {
    gapi?: { load: (library: string, callback: () => void) => void };
    google?: {
        accounts?: {
            oauth2?: {
                initTokenClient: (config: {
                    client_id: string;
                    scope: string;
                    callback: (response: { access_token?: string; error?: string }) => void;
                }) => { requestAccessToken: (options?: { prompt?: string }) => void };
            };
        };
        picker?: GooglePickerApi;
    };
};

const PICKER_SCOPE = "https://www.googleapis.com/auth/drive.file";

function loadScript(src: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id) as HTMLScriptElement | null;
        if (existing?.dataset.loaded === "true") {
            resolve();
            return;
        }

        const script = existing ?? document.createElement("script");
        if (!existing) {
            script.id = id;
            script.src = src;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        script.addEventListener("load", () => {
            script.dataset.loaded = "true";
            resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error("Google Drive could not be loaded. Check your connection and try again.")), { once: true });

        // If a script was already present and loaded by another page component.
        if (existing && (window as GoogleApiWindow).google?.accounts?.oauth2 && (window as GoogleApiWindow).gapi) {
            resolve();
        }
    });
}

async function loadGoogleLibraries(): Promise<void> {
    await Promise.all([
        loadScript("https://apis.google.com/js/api.js", "studyvault-gapi"),
        loadScript("https://accounts.google.com/gsi/client", "studyvault-google-identity"),
    ]);
    const googleWindow = window as GoogleApiWindow;
    await new Promise<void>((resolve, reject) => {
        if (!googleWindow.gapi) {
            reject(new Error("Google API library did not initialize. Please reload and try again."));
            return;
        }
        googleWindow.gapi.load("picker", resolve);
    });
}

async function chooseGoogleDriveItem(kind: "file" | "folder"): Promise<DrivePickerSelection | null> {
    const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY?.trim();
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    const appId = import.meta.env.VITE_GOOGLE_APP_ID?.trim();

    if (!apiKey || !clientId || !appId) {
        throw new Error(
            "Google Drive is not configured yet. Add VITE_GOOGLE_PICKER_API_KEY, VITE_GOOGLE_CLIENT_ID, and VITE_GOOGLE_APP_ID to your Vercel project environment variables."
        );
    }

    await loadGoogleLibraries();
    const googleWindow = window as GoogleApiWindow;
    const oauth = googleWindow.google?.accounts?.oauth2;
    const pickerApi = googleWindow.google?.picker;

    if (!oauth || !pickerApi) {
        throw new Error("Google Drive tools did not initialize. Please reload and try again.");
    }

    return new Promise<DrivePickerSelection | null>((resolve, reject) => {
        let settled = false;
        const tokenClient = oauth.initTokenClient({
            client_id: clientId,
            scope: PICKER_SCOPE,
            callback: (response) => {
                if (response.error || !response.access_token) {
                    settled = true;
                    reject(new Error("Google sign-in was cancelled or failed. Please try again."));
                    return;
                }

                try {
                    const picker = new pickerApi.PickerBuilder()
                        .addView(kind === "folder" ? pickerApi.ViewId.FOLDERS : pickerApi.ViewId.DOCS)
                        .setOAuthToken(response.access_token)
                        .setDeveloperKey(apiKey)
                        .setAppId(appId)
                        .setCallback((data) => {
                            if (settled) return;
                            if (data.action === pickerApi.Action.CANCEL) {
                                settled = true;
                                resolve(null);
                                return;
                            }
                            if (data.action !== pickerApi.Action.PICKED) return;

                            const document = data.docs?.[0];
                            if (!document?.id) {
                                settled = true;
                                reject(new Error("Google Drive did not return a file. Please select a file and try again."));
                                return;
                            }

                            settled = true;
                            resolve({
                                id: document.id,
                                name: document.name?.trim() || (kind === "folder" ? "Google Drive folder" : "Google Drive resource"),
                                mimeType: document.mimeType,
                                url: document.url || (kind === "folder" ? `https://drive.google.com/drive/folders/${encodeURIComponent(document.id)}` : `https://drive.google.com/open?id=${encodeURIComponent(document.id)}`),
                            });
                        })
                        .build();
                    picker.setVisible(true);
                } catch {
                    settled = true;
                    reject(new Error("Could not open Google Drive Picker. Check your Google Cloud configuration."));
                }
            },
        });

        tokenClient.requestAccessToken({ prompt: "consent" });
    });
}


/** Opens Google Picker in folder-selection mode; saves a link to the folder, not a copy of its contents. */
export function chooseGoogleDriveFolder(): Promise<DrivePickerSelection | null> {
    return chooseGoogleDriveItem("folder");
}

export function chooseGoogleDriveFile(): Promise<DrivePickerSelection | null> {
    return chooseGoogleDriveItem("file");
}
