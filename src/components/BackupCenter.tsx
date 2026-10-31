import { useRef, useState } from "react";
import { Archive, CheckCircle2, Download, ShieldCheck, Upload, X } from "lucide-react";
import { downloadStudyVaultBackup, restoreStudyVaultBackup } from "../services/backup";
import "./backup-center.css";

type Props = { onClose: () => void };

export default function BackupCenter({ onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const exportBackup = async () => {
    setBusy("export");
    setMessage(null);
    try {
      await downloadStudyVaultBackup();
      setMessage({ kind: "success", text: "Backup created. Keep the downloaded file somewhere safe." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not create a backup." });
    } finally {
      setBusy(null);
    }
  };

  const chooseRestore = () => fileRef.current?.click();

  const restore = async (file?: File) => {
    if (!file) return;
    const confirmed = window.confirm("Restore this backup? It will replace the StudyVault data currently stored in this browser. Export a backup of the current data first if you may need it.");
    if (!confirmed) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy("restore");
    setMessage(null);
    try {
      await restoreStudyVaultBackup(file);
      setMessage({ kind: "success", text: "Backup restored. StudyVault will reload to show the restored data." });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not restore this backup." });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="sv-backup-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="sv-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-backup-title">
        <header className="sv-backup-header">
          <div className="sv-backup-icon"><ShieldCheck size={21} /></div>
          <div><span>YOUR DATA, YOUR CONTROL</span><h2 id="sv-backup-title">Backup & restore</h2></div>
          <button type="button" className="sv-backup-close" onClick={onClose} disabled={!!busy} aria-label="Close backup window"><X size={18} /></button>
        </header>
        <p className="sv-backup-intro">Your StudyVault library is stored on this device. Export a backup before switching browsers or devices, clearing site data, or making major changes.</p>
        <div className="sv-backup-actions">
          <button type="button" className="sv-backup-action" onClick={exportBackup} disabled={!!busy}>
            <span><Download size={18} /></span><strong>{busy === "export" ? "Creating backup…" : "Export full backup"}</strong><small>Notes, folders, subjects, resources, attachments and StudyVault settings.</small>
          </button>
          <button type="button" className="sv-backup-action" onClick={chooseRestore} disabled={!!busy}>
            <span><Upload size={18} /></span><strong>{busy === "restore" ? "Restoring backup…" : "Restore from file"}</strong><small>Replaces current StudyVault data. Confirmation is required.</small>
          </button>
        </div>
        <input ref={fileRef} className="sv-backup-file-input" type="file" accept=".json,application/json" onChange={(event) => void restore(event.target.files?.[0])} />
        <div className="sv-backup-safety"><Archive size={15} /><span>Backup files may contain your personal study notes and attachments. Store them privately.</span></div>
        {message && <p className={`sv-backup-message ${message.kind}`} role="status">{message.kind === "success" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}{message.text}</p>}
      </section>
    </div>
  );
}
