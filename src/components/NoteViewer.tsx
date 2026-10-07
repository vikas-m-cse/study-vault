
import { X, FileText } from "lucide-react";

type NoteViewerProps = {
    title: string;
    content: string;
    onClose: () => void;
};

export function NoteViewer({ title, content, onClose }: NoteViewerProps) {
    return (
        <div
            className="resource-modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="note-viewer-modal" role="dialog" aria-modal="true" aria-label={title}>
                <div className="resource-modal-heading">
                    <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                        <div className="resource-icon" style={{ flexShrink: 0 }}>
                            <FileText size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: "19px" }}>{title}</h2>
                            <p style={{ margin: "4px 0 0", color: "#778195", fontSize: "13px" }}>
                                Text note
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="subject-action-button"
                        onClick={onClose}
                        aria-label="Close note"
                    >
                        <X size={19} />
                    </button>
                </div>

                <div className="note-viewer-body">
                    {content.split("\n").map((line, index) =>
                        line === "" ? (
                            <br key={index} />
                        ) : (
                            <p key={index} style={{ margin: "0 0 6px" }}>
                                {line}
                            </p>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
